import xlsx from "xlsx";
import {
  CreateReceivingReportRequest,
  ReceivingReportRawEntry,
  ReceivingReportResponse,
  SearchReceivingReportRequest,
  toReceivingReportResponse,
} from "../model/receiving-report-model";
import { Validation } from "../validation/validation";
import { ReceivingReportValidation } from "../validation/receiving-report-validation";
import { prismaClient } from "../application/database";
import { logger } from "../application/logging";
import { Pageable } from "../model/page";
import { ResponseError } from "../error/response-error";

export class ReceivingReportService {
  static async create(filePath: string) {
    const workbook: xlsx.WorkBook = xlsx.readFile(filePath);

    const sheet: xlsx.WorkSheet = workbook.Sheets["Sheet1"];

    const data: any[][] = xlsx.utils.sheet_to_json(sheet, {
      header: 1,
    });

    const headers: string[] = data[6] as string[];

    const importantHeaders: string[] = ["Product Code", "Received"];

    const missingHeaders: string[] = importantHeaders.filter(
      (h) => !headers.includes(h)
    );
    if (missingHeaders.length > 0) {
      logger.error(`Missing important headers: ${missingHeaders.join(", ")}`);
      throw new Error(
        `Missing important headers: ${missingHeaders.join(", ")}`
      );
    }

    const receivingReports: ReceivingReportRawEntry[] = [];

    for (let i = 7; i < data.length - 1; i++) {
      if (data[i].length === 0) continue;

      const receivingReportTemp: ReceivingReportRawEntry = {};

      for (let j = 0; j < headers.length; j++) {
        receivingReportTemp[headers[j]] = data[i][j];
      }

      const isDescriptionOnly: boolean =
        data[i].filter(Boolean).length === 1 &&
        Boolean(receivingReportTemp["Description"]);

      if (isDescriptionOnly && receivingReports.length > 0) {
        receivingReports[receivingReports.length - 1][
          "Description"
        ] += ` ${receivingReportTemp["Description"]}`;
        continue;
      }

      receivingReports.push(receivingReportTemp);
    }

    const parseNumber = (val: string): number => Number(val);

    const parseString = (val: string): string => val.toString();

    const isValidProductCode = (code: string): boolean => {
      const prefix = code.split("-")[0];
      return prefix === "EA";
    };

    const purrchaseOrderFormattedResult: CreateReceivingReportRequest[] =
      receivingReports
        .filter(
          (entry: ReceivingReportRawEntry) =>
            entry["Product Code"] !== undefined &&
            entry.Received !== undefined &&
            isValidProductCode(entry["Product Code"])
        )
        .map((entry: ReceivingReportRawEntry) => ({
          kanban_code: parseString(entry["Product Code"]),
          received_quantity: parseNumber(entry.Received),
        }));

    try {
      const createRequest = Validation.validate(
        ReceivingReportValidation.CREATE,
        purrchaseOrderFormattedResult
      );

      const kanbanCodes = createRequest.map((item: any) => item.kanban_code);
      const existingKanbans = await prismaClient.kanban.findMany({
        where: { code: { in: kanbanCodes } },
        select: { code: true },
      });

      const existingCodesSet = new Set(existingKanbans.map((k) => k.code));

      const validRequests = createRequest.filter((item: any) => {
        const exists = existingCodesSet.has(item.kanban_code);
        if (!exists) {
          logger.warn(`Kanban code not found: ${item.kanban_code}`);
        }
        return exists;
      });

      if (validRequests.length === 0) {
        logger.warn("No valid kanban codes found. Aborting insert.");
        throw new Error("No valid kanban codes found. Aborting insert.");
      }

      const transactionQueries = [];

      transactionQueries.push(
        prismaClient.receivingReport.createMany({ data: validRequests })
      );

      const grouped = validRequests.reduce((acc, item) => {
        acc[item.kanban_code] =
          (acc[item.kanban_code] || 0) + item.received_quantity;
        return acc;
      }, {} as Record<string, number>);

      for (const [kanban_code, totalQuantity] of Object.entries(grouped)) {
        transactionQueries.push(
          prismaClient.kanban.update({
            where: { code: kanban_code },
            data: {
              stock_in_quantity: { increment: totalQuantity },
            },
          })
        );
      }

      await prismaClient.$transaction(transactionQueries);

      logger.info(
        "Receiving report(s) created and stock_in_quantity updated successfully"
      );
      return true;
    } catch (error) {
      logger.error(
        `Error while creating receiving report and updating kanban: ${error}`
      );
      throw new Error(
        `Error while creating receiving report and updating kanban: ${error}`
      );
    }
  }

  static async get(
    request: SearchReceivingReportRequest
  ): Promise<Pageable<ReceivingReportResponse>> {
    const filters: any[] = [];

    const keyword = request.keyword || request.kanban;
    if (keyword) {
      const cleanKeyword = keyword.replace(/\\/g, "\\\\");
      filters.push({
        OR: [
          {
            kanban_code: {
              contains: cleanKeyword,
            },
          },
          {
            Kanban: {
              specification: {
                contains: cleanKeyword,
              },
            },
          },
          {
            Kanban: {
              description: {
                contains: cleanKeyword,
              },
            },
          },
        ],
      });
    }

    if (request.start_date) {
      filters.push({
        created_at: {
          gte: new Date(request.start_date),
        },
      });
    }

    if (request.end_date) {
      const endDate = new Date(request.end_date);
      endDate.setHours(23, 59, 59, 999);
      filters.push({
        created_at: {
          lte: endDate,
        },
      });
    }

    const whereClause = filters.length > 0 ? { AND: filters } : {};

    const page = request.page || 1;
    const limit = request.limit || 10;
    const skip = (page - 1) * limit;

    const [total, reports] = await Promise.all([
      prismaClient.receivingReport.count({
        where: whereClause,
      }),
      prismaClient.receivingReport.findMany({
        where: whereClause,
        take: request.paginate !== false ? limit : undefined,
        skip: request.paginate !== false ? skip : undefined,
        orderBy: {
          created_at: "desc",
        },
        include: {
          Kanban: {
            include: {
              rack: true,
              maker: true,
              supplier: true,
              machine_area: true,
            },
          },
        },
      }),
    ]);

    const totalPage = Math.ceil(total / limit);

    return {
      data: reports.map(toReceivingReportResponse),
      pagination: {
        total,
        curr_page: page,
        limit,
        total_page: totalPage,
      },
    };
  }

  static async show(id: number): Promise<ReceivingReportResponse> {
    const report = await prismaClient.receivingReport.findUnique({
      where: { id },
      include: {
        Kanban: {
          include: {
            rack: true,
            maker: true,
            supplier: true,
            machine_area: true,
            machine: true,
          },
        },
      },
    });

    if (!report) {
      throw new ResponseError(404, "Receiving report not found");
    }

    return toReceivingReportResponse(report);
  }
}
