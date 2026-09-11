import { prismaClient } from "../application/database";
import { logger } from "../application/logging";

export interface ResetOptions {
  purchase_orders?: boolean;
  purchase_requests?: boolean;
  manual_purchase_orders?: boolean;
  stock_ins?: boolean;
  stock_outs?: boolean;
  receiving_reports?: boolean;
  processed_files?: boolean;
  reset_kanban_balances?: boolean;
}

export class ResetService {
  /**
   * Reset specific or all transaction data based on options
   */
  static async resetData(options: ResetOptions = {}) {
    const isAll =
      !options ||
      Object.keys(options).length === 0 ||
      (options.purchase_orders &&
        options.purchase_requests &&
        options.manual_purchase_orders &&
        options.stock_ins &&
        options.stock_outs);

    const resetPO = isAll || options.purchase_orders;
    const resetPR = isAll || options.purchase_requests;
    const resetManualPO = isAll || options.manual_purchase_orders;
    const resetStockIn = isAll || options.stock_ins;
    const resetStockOut = isAll || options.stock_outs;
    const resetReceiving = isAll || options.receiving_reports;
    const resetProcessedFiles = isAll || options.processed_files;
    const resetBalances = isAll || options.reset_kanban_balances;

    const summary: Record<string, number> = {};

    await prismaClient.$transaction(
      async (prisma) => {
        // 1. Stock Out
        if (resetStockOut) {
          const deletedLogs = await prisma.stockOutChangeLog.deleteMany({});
          const deletedStockOuts = await prisma.stockOut.deleteMany({});
          summary.stock_out_change_logs = deletedLogs.count;
          summary.stock_outs = deletedStockOuts.count;
        }

        // 2. Stock In
        if (resetStockIn) {
          const deletedStockIns = await prisma.stockIn.deleteMany({});
          summary.stock_ins = deletedStockIns.count;
        }

        // 3. Receiving Reports
        if (resetReceiving || resetStockIn) {
          const deletedReceiving = await prisma.receivingReport.deleteMany({});
          summary.receiving_reports = deletedReceiving.count;
        }

        // 4. Manual Purchase Orders
        if (resetManualPO) {
          const deletedManualPO = await prisma.manualPurchaseOrder.deleteMany({});
          summary.manual_purchase_orders = deletedManualPO.count;
        }

        // 5. Purchase Orders & Staggings
        if (resetPO) {
          const deletedStockOrderKanbans =
            await prisma.stockOrderKanban.deleteMany({});
          const deletedPODetails = await prisma.purchaseOrderDetail.deleteMany({});
          const deletedPOs = await prisma.purchaseOrder.deleteMany({});
          const deletedPOStaggingDetails =
            await prisma.purchaseOrderDetailStagging.deleteMany({});
          const deletedPOStaggings =
            await prisma.purchaseOrderStagging.deleteMany({});
          const deletedKanbanStaggings =
            await prisma.kanbanStagging.deleteMany({});

          summary.stock_order_kanbans = deletedStockOrderKanbans.count;
          summary.purchase_order_details = deletedPODetails.count;
          summary.purchase_orders = deletedPOs.count;
          summary.purchase_order_detail_staggings =
            deletedPOStaggingDetails.count;
          summary.purchase_order_staggings = deletedPOStaggings.count;
          summary.kanban_staggings = deletedKanbanStaggings.count;
        }

        // 6. Purchase Requests
        if (resetPR) {
          const deletedPRDetails =
            await prisma.purchaseRequestDetail.deleteMany({});
          const deletedPRs = await prisma.purchaseRequest.deleteMany({});
          summary.purchase_request_details = deletedPRDetails.count;
          summary.purchase_requests = deletedPRs.count;
        }

        // 7. Processed Files
        if (resetProcessedFiles) {
          const deletedFiles = await prisma.processedFile.deleteMany({});
          summary.processed_files = deletedFiles.count;
        }

        // 8. Kanban Balances & Counters Sync
        if (resetBalances || isAll || (resetStockIn && resetStockOut)) {
          // Reset balance to js_ending_quantity, and reset temporary transaction counters
          await prisma.$executeRawUnsafe(`
            UPDATE kanbans 
            SET 
              balance = js_ending_quantity,
              stock_in_quantity = 0,
              incoming_order_stock = 0
          `);
          summary.kanban_balances_reset = 1;
        } else {
          // If only PO reset, reset incoming_order_stock
          if (resetPO) {
            await prisma.kanban.updateMany({
              data: { incoming_order_stock: 0 },
            });
          }
          // If only StockIn reset, reset stock_in_quantity
          if (resetStockIn) {
            await prisma.kanban.updateMany({
              data: { stock_in_quantity: 0 },
            });
          }
        }
      },
      { timeout: 60000 }
    );

    logger.info("Reset data executed successfully: %o", summary);
    return summary;
  }

  static async resetPurchaseOrders() {
    return this.resetData({ purchase_orders: true });
  }

  static async resetPurchaseRequests() {
    return this.resetData({ purchase_requests: true });
  }

  static async resetManualPurchaseOrders() {
    return this.resetData({ manual_purchase_orders: true });
  }

  static async resetStockIns() {
    return this.resetData({ stock_ins: true });
  }

  static async resetStockOuts() {
    return this.resetData({ stock_outs: true });
  }

  static async resetAll() {
    return this.resetData({});
  }
}
