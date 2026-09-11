import { prismaClient } from "../application/database";
import { logger } from "../application/logging";
import moment from "moment";

export interface SimulationItem {
  code: string;
  description: string;
  po_quantity: number;
  stock_in_quantity: number;
  balance: number;
}

export interface SimulationResult {
  pr_number: string;
  po_number: string;
  total_items: number;
  items: SimulationItem[];
}

export class SimulationService {
  /**
   * Run full end-to-end procurement and receiving simulation for all 20 kanbans:
   * 1. Create Purchase Request (PR)
   * 2. Create Purchase Order (PO) with 'On Order' status
   * 3. Create Receiving Report (RR) with received quantity
   * 4. Update Kanban incoming_order_stock & stock_in_quantity with varying, non-identical values
   */
  static async simulateFullFlow(): Promise<SimulationResult> {
    const timestamp = moment().format("YYYYMMDD-HHmmss");
    const prNumber = `PR-SIM-${timestamp}`;
    const poNumber = `PO-SIM-${timestamp}`;

    // Preset quantities for each of the 20 kanbans (varying, non-identical)
    const quantityPresets: Record<
      string,
      { po_qty: number; stock_in_qty: number }
    > = {
      TOHO001: { po_qty: 15, stock_in_qty: 8 },
      TOHO002: { po_qty: 12, stock_in_qty: 6 },
      TOHO003: { po_qty: 20, stock_in_qty: 10 },
      TOHO004: { po_qty: 8, stock_in_qty: 3 },
      TOHO005: { po_qty: 10, stock_in_qty: 4 },
      TOHO006: { po_qty: 14, stock_in_qty: 7 },
      TOHO007: { po_qty: 6, stock_in_qty: 2 },
      TOHO008: { po_qty: 16, stock_in_qty: 9 },
      TOHO009: { po_qty: 18, stock_in_qty: 8 },
      TOHO010: { po_qty: 10, stock_in_qty: 5 },
      TOHO011: { po_qty: 8, stock_in_qty: 4 },
      TOHO012: { po_qty: 15, stock_in_qty: 6 },
      TOHO013: { po_qty: 9, stock_in_qty: 3 },
      TOHO014: { po_qty: 7, stock_in_qty: 2 },
      TOHO015: { po_qty: 16, stock_in_qty: 8 },
      TOHO016: { po_qty: 5, stock_in_qty: 2 },
      TOHO017: { po_qty: 11, stock_in_qty: 5 },
      TOHO018: { po_qty: 10, stock_in_qty: 4 },
      TOHO019: { po_qty: 14, stock_in_qty: 7 },
      TOHO020: { po_qty: 6, stock_in_qty: 3 },
    };

    // 1. Fetch active kanbans
    const kanbans = await prismaClient.kanban.findMany({
      where: { deleted_at: null },
      include: {
        supplier: true,
      },
      orderBy: { code: "asc" },
      take: 20,
    });

    const supplierId = kanbans[0]?.supplier?.[0]?.id || 1;

    const resultItems: SimulationItem[] = [];

    await prismaClient.$transaction(
      async (prisma) => {
        // 2. Create Purchase Request Header
        await prisma.purchaseRequest.create({
          data: {
            pr_number: prNumber,
            department: "MAINTENANCE",
            date: new Date(),
            requested: "System Simulator",
            kind_of_request: "Routine Stock Replenishment",
            type: "Spareparts",
          },
        });

        // 3. Create Purchase Order Header
        await prisma.purchaseOrder.create({
          data: {
            po_number: poNumber,
            department: "MAINTENANCE",
            supplier_id: supplierId,
            po_date: new Date(),
            pr_date: new Date(),
          },
        });

        // 4. Populate details for each Kanban
        for (let i = 0; i < kanbans.length; i++) {
          const k = kanbans[i];
          const preset = quantityPresets[k.code] || {
            po_qty: 10 + (i % 8) * 2,
            stock_in_qty: 4 + (i % 5),
          };

          const poQty = preset.po_qty;
          const stockInQty = preset.stock_in_qty;

          // A. Purchase Request Detail
          await prisma.purchaseRequestDetail.create({
            data: {
              pr_number: prNumber,
              kanban_code: k.code,
              item_name: k.description || k.code,
              description_of_goods: k.description,
              specification: k.specification,
              quantity: poQty,
              unit: k.uom || "Pcs",
              est_unit_price: k.price ? Number(k.price) : 50000,
              est_amount: k.price ? Number(k.price) * poQty : 50000 * poQty,
              currency: k.currency || "IDR",
              req_delivery: new Date(),
              is_active: true,
            },
          });

          // B. Purchase Order Detail
          await prisma.purchaseOrderDetail.create({
            data: {
              po_number: poNumber,
              pr_number: prNumber,
              kanban_code: k.code,
              description: k.description,
              specification: k.specification,
              quantity: poQty,
              unit: k.uom || "Pcs",
              status: "On Order",
              is_active: true,
            },
          });

          // C. Stock Order Kanban Junction
          await prisma.stockOrderKanban.create({
            data: {
              po_number: poNumber,
              kanban_code: k.code,
              last_stock: k.balance,
            },
          });

          // D. Receiving Report
          await prisma.receivingReport.create({
            data: {
              kanban_code: k.code,
              received_quantity: stockInQty,
            },
          });

          // E. Update Kanban Counters
          await prisma.kanban.update({
            where: { id: k.id },
            data: {
              incoming_order_stock: poQty,
              stock_in_quantity: stockInQty,
            },
          });

          resultItems.push({
            code: k.code,
            description: k.description || "-",
            po_quantity: poQty,
            stock_in_quantity: stockInQty,
            balance: k.balance,
          });
        }
      },
      { timeout: 60000 }
    );

    logger.info(
      `Full flow simulation completed. PR: ${prNumber}, PO: ${poNumber}, Total items: ${resultItems.length}`
    );

    return {
      pr_number: prNumber,
      po_number: poNumber,
      total_items: resultItems.length,
      items: resultItems,
    };
  }
}
