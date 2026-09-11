import {
  KanbanResponse,
  CreateKanbanRequest,
  UpdateKanbanRequest,
  toKanbanResponse,
  SearchKanbanRequest,
  KanbanRawEntry,
  CreateKanbanImportRequest,
} from "../model/kanban-model";
import { Validation } from "../validation/validation";
import { KanbanValidation } from "../validation/kanban-validation";
import { prismaClient } from "../application/database";
import { logger } from "../application/logging";
import { ResponseError } from "../error/response-error";
import { Pageable } from "../model/page";
import xlsx from "xlsx";
import { Workbook, BorderStyle } from "exceljs";
import path from "path";
import { startOfMonth, endOfMonth } from "date-fns";

export class KanbanService {
  static async createFromRequest(
    request: CreateKanbanRequest
  ): Promise<KanbanResponse> {
    const createRequest = Validation.validate(KanbanValidation.CREATE, request);

    // Validasi unique: part_code
    const isCodeExist = await prismaClient.kanban.findUnique({
      where: { code: createRequest.code },
    });
    if (isCodeExist) {
      throw new ResponseError(400, "Code already exist");
    }

    // Validasi foreign key: rack_id
    const isRackExist = await prismaClient.rack.findUnique({
      where: { id: createRequest.rack_id },
    });
    if (!isRackExist) {
      throw new ResponseError(404, "Rack not found");
    }

    // Validasi foreign key: machine_area_id
    if (createRequest.machine_area_id) {
      const isMachineAreaExist = await prismaClient.machineArea.findUnique({
        where: { id: createRequest.machine_area_id },
      });
      if (!isMachineAreaExist) {
        throw new ResponseError(404, "Machine Area not found");
      }
    }

    // Validasi foreign key: machine_id
    if (createRequest.machine_id) {
      const isMachineExist = await prismaClient.machine.findUnique({
        where: { id: createRequest.machine_id },
      });
      if (!isMachineExist) {
        throw new ResponseError(404, "Machine not found");
      }
    }

    const Kanban = await prismaClient.$transaction(async (tx) => {
      // 1️⃣ Buat parent dulu
      const kanbanParent = await tx.kanbanParent.create({
        data: {
          original_code: createRequest.code,
        },
      });

      // 2️⃣ Buat kanban yang berelasi dengan parent di atas
      const kanban = await tx.kanban.create({
        data: {
          ...createRequest,
          kanban_parent_id: kanbanParent.id,
        },
        include: {
          rack: true,
          machine_area: true,
          machine: true,
          supplier: true,
          maker: true,
        },
      });

      return kanban;
    });

    return toKanbanResponse(Kanban);
  }

  static async create(filePath: string) {
    const workbook: xlsx.WorkBook = xlsx.readFile(filePath);

    const sheet: xlsx.WorkSheet = workbook.Sheets["Sheet1"];

    if (!sheet) {
      logger.error("MASTER MATERIAL sheet not found");
      throw new Error("MASTER MATERIAL sheet not found");
    }

    const data: any[][] = xlsx.utils.sheet_to_json(sheet, {
      header: 1,
    });

    const headers: string[] = data[3] as string[];

    const importantHeaders: string[] = [
      "CODE JS SYSTEM",
      "AREA",
      "CODE RACK",
      "MESIN",
      "DESCRIPTION",
      "SPECIFICATION",
      "MAKER",
      "CURRENCY",
      "PRICE",
      "UoM",
      "Safety Stock",
      "Minimal Stock",
      "Maximal Stock",
      "Lead Time",
      "Order Point",
      "Rank",
    ];

    const missingHeaders: string[] = importantHeaders.filter(
      (h) => !headers.includes(h)
    );
    if (missingHeaders.length > 0) {
      logger.error(`Missing important headers: ${missingHeaders.join(", ")}`);
      throw new Error(
        `Missing important headers: ${missingHeaders.join(", ")}`
      );
    }

    const kanbans: KanbanRawEntry[] = [];

    for (let i = 4; i < data.length; i++) {
      // if (data[i].length !== headers.length) {
      //     continue
      // };

      const kanbanTemp: KanbanRawEntry = {};

      for (let j = 0; j < headers.length; j++) {
        kanbanTemp[headers[j]] = data[i][j];
      }

      kanbans.push(kanbanTemp);
    }

    const parseNumber = (val: string | number | undefined): number | null =>
      val != null && val !== "-" ? Number(val) : null;

    const parseString = (val: string | undefined): string | null =>
      val && val !== "-" ? val.toString() : null;

    const isValidProductCode = (code: string): boolean => {
      const prefix = code.split("-")[0];
      return prefix === "EA";
    };

    function cleanValue(value: any): string | null {
      if (
        value === "" ||
        value === null ||
        value === undefined ||
        value === "-"
      ) {
        return null;
      }
      const str = parseString(value);
      return str ? str.trim().replace(/\s+/g, " ") : null;
    }

    const makerNames = Array.from(
      new Set(
        kanbans
          .map((entry) => cleanValue(entry.MAKER))
          .filter((s): s is string => !!s)
      )
    );

    const existingMakers = await prismaClient.maker.findMany({
      where: { name: { in: makerNames } },
      select: { id: true, name: true },
    });

    const existingMakerMap = new Map(existingMakers.map((s) => [s.name, s.id]));

    const newMakerNames = makerNames.filter(
      (name) => !existingMakerMap.has(name)
    );

    const newMakers = await prismaClient.$transaction(async (tx) => {
      return await tx.maker
        .createMany({
          data: newMakerNames.map((name) => ({ name })),
          skipDuplicates: true,
        })
        .then(() =>
          tx.maker.findMany({
            where: { name: { in: newMakerNames } },
            select: { id: true, name: true },
          })
        );
    });

    newMakers.forEach((s) => existingMakerMap.set(s.name, s.id));

    const areaNames = Array.from(
      new Set(
        kanbans
          .map((entry) => cleanValue(entry.AREA))
          .filter((s): s is string => !!s)
      )
    );

    const existingAreas = await prismaClient.machineArea.findMany({
      where: { name: { in: areaNames } },
      select: { id: true, name: true },
    });

    const existingAreaMap = new Map(existingAreas.map((s) => [s.name, s.id]));

    const newAreaNames = areaNames.filter((name) => !existingAreaMap.has(name));

    const newAreas = await prismaClient.$transaction(async (tx) => {
      return await tx.machineArea
        .createMany({
          data: newAreaNames.map((name) => ({ name })),
          skipDuplicates: true,
        })
        .then(() =>
          tx.machineArea.findMany({
            where: { name: { in: newAreaNames } },
            select: { id: true, name: true },
          })
        );
    });

    newAreas.forEach((s) => existingAreaMap.set(s.name, s.id));

    const machineNames = Array.from(
      new Set(
        kanbans
          .map((entry) => cleanValue(entry.MESIN))
          .filter((s): s is string => !!s)
      )
    );

    const existingMachines = await prismaClient.machine.findMany({
      where: { code: { in: machineNames } },
      select: { id: true, code: true },
    });

    const existingMachineMap = new Map(
      existingMachines.map((s) => [s.code, s.id])
    );

    const newMachineNames = machineNames.filter(
      (code) => !existingMachineMap.has(code)
    );

    const newMachines = await prismaClient.$transaction(async (tx) => {
      return await tx.machine
        .createMany({
          data: newMachineNames.map((code) => ({ code })),
          skipDuplicates: true,
        })
        .then(() =>
          tx.machine.findMany({
            where: { code: { in: newMachineNames } },
            select: { id: true, code: true },
          })
        );
    });

    newMachines.forEach((s) => existingMachineMap.set(s.code, s.id));

    const rackNames = Array.from(
      new Set(
        kanbans
          .map((entry) => cleanValue(entry["CODE RACK"]))
          .filter((s): s is string => !!s)
      )
    );

    const existingRacks = await prismaClient.rack.findMany({
      where: { code: { in: rackNames } },
      select: { id: true, code: true },
    });

    const existingRackMap = new Map(existingRacks.map((s) => [s.code, s.id]));

    const newRackNames = rackNames.filter((code) => !existingRackMap.has(code));

    const newRacks = await prismaClient.$transaction(async (tx) => {
      return await tx.rack
        .createMany({
          data: newRackNames.map((code) => ({ code })),
          skipDuplicates: true,
        })
        .then(() =>
          tx.rack.findMany({
            where: { code: { in: newRackNames } },
            select: { id: true, code: true },
          })
        );
    });

    newRacks.forEach((s) => existingRackMap.set(s.code, s.id));

    const kanbanFormattedResult: CreateKanbanImportRequest[] = kanbans
      .filter(
        (entry: KanbanRawEntry) =>
          entry["CODE JS SYSTEM"] !== undefined &&
          entry["CODE JS SYSTEM"] !== null &&
          entry["CODE JS SYSTEM"] !== "" &&
          isValidProductCode(entry["CODE JS SYSTEM"])
      )
      .map((entry: KanbanRawEntry) => {
        const makerName =
          entry.MAKER === "" ||
          entry.MAKER === null ||
          entry.MAKER === undefined ||
          entry.MAKER === "-"
            ? null
            : parseString(entry.MAKER);
        const maker_id = makerName
          ? existingMakerMap.get(makerName)
          : undefined;

        const areaName =
          entry.AREA === "" ||
          entry.AREA === null ||
          entry.AREA === undefined ||
          entry.AREA === "-"
            ? null
            : parseString(entry.AREA);
        const area_id = areaName ? existingAreaMap.get(areaName) : undefined;

        const machineName =
          entry.MESIN === "" ||
          entry.MESIN === null ||
          entry.MESIN === undefined ||
          entry.MESIN === "-"
            ? null
            : parseString(entry.MESIN);
        const machine_id = machineName
          ? existingMachineMap.get(machineName)
          : undefined;

        const rackName =
          entry["CODE RACK"] === "" ||
          entry["CODE RACK"] === null ||
          entry["CODE RACK"] === undefined ||
          entry["CODE RACK"] === "-"
            ? null
            : parseString(entry["CODE RACK"]);
        const rack_id = rackName ? existingRackMap.get(rackName) : undefined;

        return {
          code: entry["CODE JS SYSTEM"],
          uom: parseString(entry.UoM),
          min_quantity: parseNumber(entry["Minimal Stock"]),
          max_quantity: parseNumber(entry["Maximal Stock"]),
          lead_time: parseNumber(entry["Lead Time"]),
          description: parseString(entry.DESCRIPTION),
          specification: parseString(entry.SPECIFICATION),
          maker_id: maker_id,
          area_id: area_id,
          machine_id: machine_id,
          machine_area_id: area_id,
          rack_id: rack_id,
          safety_stock: parseNumber(entry["Safety Stock"]),
          order_point: parseNumber(entry["Order Point"]),
          rank: parseString(entry.Rank),
          currency: parseString(entry.CURRENCY),
          price: parseNumber(entry.PRICE),
        };
      });

    try {
      // Validasi data dari input
      const createRequest = Validation.validate(
        KanbanValidation.CREATE_MULTIPLE,
        kanbanFormattedResult
      );

      const createConnect = (field: string, id: any) =>
        id ? { [field]: { connect: { id } } } : {};

      const createKanbanData = (data: any) => {
        const {
          rack_id,
          maker_id,
          machine_id,
          machine_area_id,
          supplier_id,
          ...rest
        } = data;

        return {
          ...rest,
          ...createConnect("supplier", supplier_id),
          ...createConnect("rack", rack_id),
          ...createConnect("maker", maker_id),
          ...createConnect("machine", machine_id),
          ...createConnect("machine_area", machine_area_id),
        };
      };

      const chunkSize = 50;

      // Bagi data menjadi chunk untuk mencegah beban berat dalam satu transaksi
      for (let i = 0; i < createRequest.length; i += chunkSize) {
        const chunk = createRequest.slice(i, i + chunkSize);

        await prismaClient.$transaction(async (tx) => {
          for (const item of chunk) {
            const kanbanData = createKanbanData(item);
            await tx.kanban.upsert({
              where: { code: item.code },
              update: kanbanData, // update jika code sudah ada
              create: kanbanData, // insert jika belum ada
            });
            logger.info(`Kanban with code ${item.code} upserted`);
          }
        });
      }

      return true;
    } catch (error) {
      logger.error("Error while upserting kanban master data: " + error);
      throw new ResponseError(400, "Invalid request");
    }
  }

  static async update(
    id: number,
    request: UpdateKanbanRequest
  ): Promise<KanbanResponse> {
    if (isNaN(id)) {
      throw new ResponseError(400, "Invalid id");
    }

    const idISValid = await prismaClient.kanban.findUnique({
      where: {
        id: id,
      },
    });

    if (!idISValid) {
      throw new ResponseError(400, "Kanban not found");
    }

    const updateRequest = Validation.validate(KanbanValidation.UPDATE, request);

    const isPartExist = await prismaClient.kanban.findFirst({
      where: {
        code: updateRequest.code,
        id: {
          not: id,
        },
      },
    });

    if (isPartExist) {
      throw new ResponseError(400, "Code already exists");
    }

    // Validasi foreign key: rack_id
    const isRackExist = await prismaClient.rack.findUnique({
      where: { id: updateRequest.rack_id },
    });
    if (!isRackExist) {
      throw new ResponseError(404, "Rack not found");
    }

    if (updateRequest.machine_area_id) {
      const isMachineAreaExist = await prismaClient.machineArea.findUnique({
        where: { id: updateRequest.machine_area_id },
      });
      if (!isMachineAreaExist) {
        throw new ResponseError(404, "Machine Area not found");
      }
    }
    if (updateRequest.machine_id) {
      const isMachineExist = await prismaClient.machine.findUnique({
        where: { id: updateRequest.machine_id },
      });
      if (!isMachineExist) {
        throw new ResponseError(404, "Machine not found");
      }
    }

    // Lakukan update dengan relasi menggunakan `connect`
    const kanban = await prismaClient.kanban.update({
      where: {
        id: id,
      },
      data: {
        code: updateRequest.code,
        min_quantity: updateRequest.min_quantity,
        max_quantity: updateRequest.max_quantity,
        description: updateRequest.description,
        specification: updateRequest.specification,
        balance: updateRequest.balance,
        uom: updateRequest.uom,
        lead_time: updateRequest.lead_time,
        safety_stock: updateRequest.safety_stock,
        order_point: updateRequest.order_point,
        price: updateRequest.price,
        currency: updateRequest.currency,
        rank: updateRequest.rank,
        rack: {
          connect: { id: updateRequest.rack_id },
        },
        machine_area:
          updateRequest.machine_area_id !== null
            ? { connect: { id: updateRequest.machine_area_id } }
            : undefined,
        machine: updateRequest.machine_id
          ? { connect: { id: updateRequest.machine_id } }
          : undefined,
        supplier: updateRequest.supplier_id
          ? { connect: { id: updateRequest.supplier_id } }
          : undefined,
        maker: updateRequest.maker_id
          ? { connect: { id: updateRequest.maker_id } }
          : undefined,
      },
      include: {
        rack: true,
        machine_area: true,
        machine: true,
        maker: true,
        supplier: true,
      },
    });

    return toKanbanResponse(kanban);
  }

  static async get(
    request: SearchKanbanRequest
  ): Promise<Pageable<KanbanResponse>> {
    const searchRequest = Validation.validate(KanbanValidation.SEARCH, request);

    const filters: any[] = [];

    if (searchRequest.keyword) {
      const keyword = searchRequest.keyword.replace(/\\/g, "\\\\");
      filters.push({
        OR: [
          { code: { contains: keyword } },
          { description: { contains: keyword } },
          { specification: { contains: keyword } },
          { rack: { code: { contains: keyword } } },
        ],
      });
    }

    if (searchRequest.completed_status) {
      if (searchRequest.completed_status.toLocaleLowerCase() === "completed") {
        filters.push({
          AND: [
            { machine_area_id: { not: null } },
            { machine_id: { not: null } },
            { rack_id: { not: null } },
            { maker_id: { not: null } },
            { description: { not: null } },
            { specification: { not: null } },
            { currency: { not: null } },
            { price: { not: null } },
            { uom: { not: null } },
            { safety_stock: { not: null } },
            { order_point: { not: null } },
            { min_quantity: { not: null } },
            { max_quantity: { not: null } },
            { lead_time: { not: null } },
            { rank: { not: null } },
          ],
        });
      } else if (
        searchRequest.completed_status.toLocaleLowerCase() === "uncompleted"
      ) {
        filters.push({
          OR: [
            { machine_area_id: null },
            { machine_id: null },
            { rack_id: null },
            { maker_id: null },
            { description: null },
            { specification: null },
            { currency: null },
            { price: null },
            { uom: null },
            { safety_stock: null },
            { order_point: null },
            { min_quantity: null },
            { max_quantity: null },
            { lead_time: null },
            { rank: null },
          ],
        });
      }
    }

    if (searchRequest.js_balance_status) {
      const status = searchRequest.js_balance_status.trim().toLowerCase();

      if (status === "balance") {
        filters.push({
          balance: {
            equals: prismaClient.kanban.fields.js_ending_quantity, // sama persis
          },
        });
      } else if (status === "unbalance") {
        filters.push({
          NOT: {
            balance: {
              equals: prismaClient.kanban.fields.js_ending_quantity,
            },
          },
        });
      }
    }

    if (searchRequest.stock_status) {
      if (searchRequest.stock_status.toLocaleLowerCase() === "overstock") {
        filters.push({
          balance: {
            gt: prismaClient.kanban.fields.max_quantity,
          },
        });
      } else if (
        searchRequest.stock_status.toLocaleLowerCase() === "understock"
      ) {
        filters.push({
          balance: {
            lt: prismaClient.kanban.fields.min_quantity,
          },
        });
      } else if (searchRequest.stock_status.toLocaleLowerCase() === "normal") {
        filters.push({
          balance: {
            gte: prismaClient.kanban.fields.min_quantity,
            lte: prismaClient.kanban.fields.max_quantity,
          },
        });
      }
    }

    if (searchRequest.rack_id) {
      filters.push({
        rack_id: searchRequest.rack_id,
      });
    }

    if (searchRequest.machine_area_id) {
      filters.push({
        machine_area_id: searchRequest.machine_area_id,
      });
    }

    if (searchRequest.machine_id) {
      filters.push({
        machine_id: searchRequest.machine_id,
      });
    }

    if (searchRequest.is_deleted) {
      filters.push({
        deleted_at: {
          not: null,
        },
      });
    } else {
      filters.push({
        deleted_at: null,
      });
    }

    const whereClause = filters.length > 0 ? { AND: filters } : {};

    // Default pagination values if not provided
    const page = searchRequest.page || 1;
    const limit = searchRequest.limit || 10;

    const skip = (page - 1) * limit;

    const start = startOfMonth(new Date());
    const end = endOfMonth(new Date());

    const [kanbans, total, stockOutSums] = await Promise.all([
      prismaClient.kanban.findMany({
        where: whereClause,
        ...(searchRequest.paginate ? { take: limit, skip } : {}),
        include: {
          rack: true,
          machine_area: true,
          machine: true,
          supplier: true,
          maker: true,
          kanban_parent: {
            include: {
              Kanban: true,
            },
          },
        },
      }),
      prismaClient.kanban.count({
        where: whereClause,
      }),
      prismaClient.stockOut.groupBy({
        by: ["kanban_code"],
        _sum: { quantity: true },
        where: {
          created_at: {
            gte: start,
            lte: end,
          },
        },
      }),
    ]);

    // Gabungkan hasilnya ke kanban
    const stockOutMap = stockOutSums.reduce((acc, item) => {
      if (item.kanban_code !== null) {
        acc[item.kanban_code] = item._sum.quantity || 0;
      }
      return acc;
    }, {} as Record<string, number>);

    const result = kanbans.map((k) => ({
      ...k,
      same_kanban_parents:
        k.kanban_parent?.Kanban.map((kp) => ({
          code: kp.code,
          specification: kp.specification,
          description: kp.description,
        })) || [],
      total_stock_out_quantity: stockOutMap[k.code] || 0,
    }));

    const pagination = searchRequest.paginate
      ? {
          curr_page: page,
          total_page: Math.ceil(total / limit),
          limit: limit,
          total: total,
        }
      : undefined;

    return {
      data: result.map(toKanbanResponse),
      ...(pagination ? { pagination } : {}),
    };
  }

  static async show(identifier: number | string): Promise<KanbanResponse> {
    let kanban;

    if (
      typeof identifier === "number" ||
      (!isNaN(Number(identifier)) && Number(identifier) > 0)
    ) {
      kanban = await prismaClient.kanban.findUnique({
        where: {
          id: Number(identifier),
        },
        include: {
          rack: true,
          machine_area: true,
          machine: true,
          supplier: true,
          maker: true,
        },
      });
    } else if (typeof identifier === "string") {
      kanban = await prismaClient.kanban.findUnique({
        where: {
          code: identifier,
        },
        include: {
          rack: true,
          machine_area: true,
          machine: true,
          supplier: true,
          maker: true,
        },
      });
    } else {
      throw new ResponseError(400, "Invalid identifier");
    }

    if (!kanban) {
      throw new ResponseError(404, "Kanban not found");
    }

    // if (kanban.deleted_at) {
    //   throw new ResponseError(404, "Kanban not found");
    // }

    const kanbanResponse = toKanbanResponse(kanban);
    if (kanban.kanban_parent_id) {
      kanbanResponse.same_kanban_parents = await prismaClient.kanban.findMany({
        where: {
          kanban_parent_id: kanban.kanban_parent_id,
        },
        select: {
          code: true,
          description: true,
          specification: true,
        },
      });
    }

    return kanbanResponse;
  }

  static async remove(id: number) {
    if (isNaN(id)) {
      throw new ResponseError(400, "Invalid id");
    }

    const kanbanISValid = await prismaClient.kanban.findUnique({
      where: {
        id: id,
        deleted_at: null,
      },
    });

    if (!kanbanISValid) {
      throw new ResponseError(404, "Kanban not found");
    }

    await prismaClient.kanban.update({
      where: {
        id: id,
      },
      data: {
        deleted_at: new Date(),
      },
    });
  }

  static async exportKanbanToExcel(status: string): Promise<any> {
    const uncompletedCondition = {
      OR: [
        { machine_area_id: null },
        { machine_id: null },
        { rack_id: null },
        { maker_id: null },
        { description: null },
        { specification: null },
        { currency: null },
        { price: null },
        { uom: null },
        { safety_stock: null },
        { order_point: null },
        { min_quantity: null },
        { max_quantity: null },
        { lead_time: null },
        { rank: null },
      ],
    };

    let where: any = {};

    if (status === "uncompleted") {
      where = uncompletedCondition;
    } else if (status === "completed") {
      where = {
        NOT: uncompletedCondition,
      };
    }

    const kanbans = await prismaClient.kanban.findMany({
      where: {
        ...where,
        deleted_at: null,
      },
      include: {
        rack: true,
        machine_area: true,
        machine: true,
        maker: true,
      },
    });

    const workbook = new Workbook();
    const templatePath = path.resolve(
      __dirname,
      "../../template_file/MasterExportTemplate.xlsx"
    );

    await workbook.xlsx.readFile(templatePath);
    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) throw new Error("Worksheet tidak ditemukan.");

    const blackBorder = {
      top: { style: "thin" as BorderStyle, color: { argb: "FF000000" } },
      left: { style: "thin" as BorderStyle, color: { argb: "FF000000" } },
      bottom: { style: "thin" as BorderStyle, color: { argb: "FF000000" } },
      right: { style: "thin" as BorderStyle, color: { argb: "FF000000" } },
    };

    let rowIndex = 5;

    for (const kanban of kanbans) {
      const row = worksheet.getRow(rowIndex++);

      const cells = [
        kanban.code,
        kanban.machine_area?.name || null,
        kanban.machine?.code || null,
        kanban.rack?.code || null,
        kanban.description,
        kanban.specification,
        kanban.maker?.name || null,
        kanban.currency,
        kanban.price,
        kanban.uom,
        kanban.safety_stock,
        kanban.min_quantity,
        kanban.order_point,
        kanban.max_quantity,
        kanban.lead_time,
        kanban.rank,
      ];

      cells.forEach((value, index) => {
        const cell = row.getCell(index + 1);

        cell.border = blackBorder;
        const prevStyle = { ...cell.style };

        if (value === null || value === undefined || value === "") {
          cell.value = "";
          if (status === "uncompleted" || status === "all") {
            cell.style = {
              ...prevStyle,
              fill: {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFFFFF00" },
              },
            };
          } else {
            cell.style = prevStyle;
          }
        } else {
          cell.value = value;
          cell.style = prevStyle;
        }
      });

      row.commit();
    }

    // await workbook.xlsx.writeFile("KanbanExport.xlsx");
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
  }

  static async exportBalanceToExcel(
    request: SearchKanbanRequest
  ): Promise<any> {
    const searchRequest = Validation.validate(KanbanValidation.SEARCH, request);

    const filters: any[] = [];

    if (searchRequest.keyword) {
      const keyword = searchRequest.keyword.replace(/\\/g, "\\\\");
      filters.push({
        OR: [
          { code: { contains: keyword } },
          { description: { contains: keyword } },
          { specification: { contains: keyword } },
          { rack: { code: { contains: keyword } } },
        ],
      });
    }

    if (searchRequest.completed_status) {
      if (searchRequest.completed_status.toLocaleLowerCase() === "completed") {
        filters.push({
          AND: [
            { machine_area_id: { not: null } },
            { machine_id: { not: null } },
            { rack_id: { not: null } },
            { maker_id: { not: null } },
            { description: { not: null } },
            { specification: { not: null } },
            { currency: { not: null } },
            { price: { not: null } },
            { uom: { not: null } },
            { safety_stock: { not: null } },
            { order_point: { not: null } },
            { min_quantity: { not: null } },
            { max_quantity: { not: null } },
            { lead_time: { not: null } },
            { rank: { not: null } },
          ],
        });
      } else if (
        searchRequest.completed_status.toLocaleLowerCase() === "uncompleted"
      ) {
        filters.push({
          OR: [
            { machine_area_id: null },
            { machine_id: null },
            { rack_id: null },
            { maker_id: null },
            { description: null },
            { specification: null },
            { currency: null },
            { price: null },
            { uom: null },
            { safety_stock: null },
            { order_point: null },
            { min_quantity: null },
            { max_quantity: null },
            { lead_time: null },
            { rank: null },
          ],
        });
      }
    }

    if (searchRequest.js_balance_status) {
      const status = searchRequest.js_balance_status.trim().toLowerCase();

      if (status === "balance") {
        filters.push({
          balance: {
            equals: prismaClient.kanban.fields.js_ending_quantity, // sama persis
          },
        });
      } else if (status === "unbalance") {
        filters.push({
          NOT: {
            balance: {
              equals: prismaClient.kanban.fields.js_ending_quantity,
            },
          },
        });
      }
    }

    if (searchRequest.stock_status) {
      if (searchRequest.stock_status.toLocaleLowerCase() === "overstock") {
        filters.push({
          balance: {
            gt: prismaClient.kanban.fields.max_quantity,
          },
        });
      } else if (
        searchRequest.stock_status.toLocaleLowerCase() === "understock"
      ) {
        filters.push({
          balance: {
            lt: prismaClient.kanban.fields.min_quantity,
          },
        });
      } else if (searchRequest.stock_status.toLocaleLowerCase() === "normal") {
        filters.push({
          balance: {
            gte: prismaClient.kanban.fields.min_quantity,
            lte: prismaClient.kanban.fields.max_quantity,
          },
        });
      }
    }

    if (searchRequest.rack_id) {
      filters.push({
        rack_id: searchRequest.rack_id,
      });
    }

    if (searchRequest.machine_area_id) {
      filters.push({
        machine_area_id: searchRequest.machine_area_id,
      });
    }

    if (searchRequest.machine_id) {
      filters.push({
        machine_id: searchRequest.machine_id,
      });
    }

    filters.push({
      deleted_at: null,
    });

    const whereClause = filters.length > 0 ? { AND: filters } : {};

    const start = startOfMonth(new Date());
    const end = endOfMonth(new Date());

    const [kanbans, stockOutSums] = await Promise.all([
      prismaClient.kanban.findMany({
        where: whereClause,
        include: {
          rack: true,
          machine_area: true,
          machine: true,
          supplier: true,
          maker: true,
        },
      }),
      prismaClient.stockOut.groupBy({
        by: ["kanban_code"],
        _sum: { quantity: true },
        where: {
          created_at: {
            gte: start,
            lte: end,
          },
        },
      }),
    ]);

    // Gabungkan hasilnya ke kanban
    const stockOutMap = stockOutSums.reduce((acc, item) => {
      if (item.kanban_code !== null) {
        acc[item.kanban_code] = item._sum.quantity || 0;
      }
      return acc;
    }, {} as Record<string, number>);

    const result = kanbans.map((k) => ({
      ...k,
      total_stock_out_quantity: stockOutMap[k.code] || 0,
    }));

    const workbook = new Workbook();
    const templatePath = path.resolve(
      __dirname,
      "../../template_file/BalanceExportTemplate.xlsx"
    );

    await workbook.xlsx.readFile(templatePath);
    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) throw new Error("Worksheet tidak ditemukan.");

    const blackBorder = {
      top: { style: "thin" as BorderStyle, color: { argb: "FF000000" } },
      left: { style: "thin" as BorderStyle, color: { argb: "FF000000" } },
      bottom: { style: "thin" as BorderStyle, color: { argb: "FF000000" } },
      right: { style: "thin" as BorderStyle, color: { argb: "FF000000" } },
    };

    let rowIndex = 8;

    for (const kanban of result) {
      const row = worksheet.getRow(rowIndex++);

      const cells = [
        kanban.code,
        kanban.rack?.code || null,
        kanban.description,
        kanban.specification,
        kanban.machine_area?.name || null,
        kanban.machine?.code || null,
        kanban.min_quantity,
        kanban.max_quantity,
        kanban.incoming_order_stock,
        kanban.stock_in_quantity,
        kanban.total_stock_out_quantity,
        kanban.balance,
        kanban.js_ending_quantity,
        kanban.balance === kanban.js_ending_quantity ? "Balance" : "Unbalance",
      ];

      cells.forEach((value, index) => {
        const cell = row.getCell(index + 1);

        cell.border = blackBorder;
        const prevStyle = { ...cell.style };

        cell.value = value;
        cell.style = prevStyle;
      });

      row.commit();
    }

    // await workbook.xlsx.writeFile("BalanceExport.xlsx");
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
  }

  static async restoreKanban(id: number) {
    return await prismaClient.kanban.update({
      where: { id: id },
      data: {
        deleted_at: null,
      },
    });
  }

  /**
   * Set or update stock_in_quantity and incoming_order_stock for kanban(s)
   */
  static async updateStockCounters(request: {
    kanban_code?: string;
    stock_in_quantity?: number;
    incoming_order_stock?: number;
    items?: Array<{
      kanban_code: string;
      stock_in_quantity?: number;
      incoming_order_stock?: number;
    }>;
    auto_populate?: boolean;
    limit?: number;
  }) {
    // 1. Single kanban update
    if (request.kanban_code) {
      const code = request.kanban_code.trim();
      const stockInQty = request.stock_in_quantity ?? 0;
      const incomingOrderStock =
        request.incoming_order_stock ?? Math.max(stockInQty, 0);

      const existing = await prismaClient.kanban.findFirst({
        where: { code },
      });

      if (!existing) {
        throw new ResponseError(
          404,
          `Kanban dengan kode '${code}' tidak ditemukan`
        );
      }

      const updated = await prismaClient.kanban.update({
        where: { id: existing.id },
        data: {
          stock_in_quantity: stockInQty,
          incoming_order_stock: incomingOrderStock,
        },
      });

      return {
        updated_count: 1,
        items: [
          {
            code: updated.code,
            stock_in_quantity: updated.stock_in_quantity,
            incoming_order_stock: updated.incoming_order_stock,
            balance: updated.balance,
          },
        ],
      };
    }

    // 2. Multiple items update
    if (
      request.items &&
      Array.isArray(request.items) &&
      request.items.length > 0
    ) {
      const results: Array<{
        code: string;
        stock_in_quantity: number;
        incoming_order_stock: number;
      }> = [];

      for (const item of request.items) {
        if (!item.kanban_code) continue;
        const code = item.kanban_code.trim();
        const stockInQty = item.stock_in_quantity ?? 0;
        const incomingOrderStock =
          item.incoming_order_stock ?? Math.max(stockInQty, 0);

        const updated = await prismaClient.kanban.updateMany({
          where: { code },
          data: {
            stock_in_quantity: stockInQty,
            incoming_order_stock: incomingOrderStock,
          },
        });

        if (updated.count > 0) {
          results.push({
            code,
            stock_in_quantity: stockInQty,
            incoming_order_stock: incomingOrderStock,
          });
        }
      }

      return {
        updated_count: results.length,
        items: results,
      };
    }

    // 3. Bulk / Auto populate active kanbans
    const stockInQty = request.stock_in_quantity ?? 10;
    const incomingOrderStock =
      request.incoming_order_stock ?? Math.max(stockInQty, 20);
    const limit = request.limit ?? 20;

    const kanbans = await prismaClient.kanban.findMany({
      where: { deleted_at: null },
      take: limit,
      select: { id: true, code: true },
    });

    const kanbanIds = kanbans.map((k) => k.id);

    await prismaClient.kanban.updateMany({
      where: { id: { in: kanbanIds } },
      data: {
        stock_in_quantity: stockInQty,
        incoming_order_stock: incomingOrderStock,
      },
    });

    return {
      updated_count: kanbans.length,
      items: kanbans.map((k) => ({
        code: k.code,
        stock_in_quantity: stockInQty,
        incoming_order_stock: incomingOrderStock,
      })),
    };
  }
}
