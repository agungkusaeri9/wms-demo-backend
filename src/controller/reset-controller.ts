import { Request, Response, NextFunction } from "express";
import { ResetService, ResetOptions } from "../service/reset-service";
import { sendSuccess } from "../helper/response-helper";

export class ResetController {
  /**
   * Reset all or specific data based on JSON body payload:
   * {
   *   "purchase_orders": true,
   *   "purchase_requests": true,
   *   "manual_purchase_orders": true,
   *   "stock_ins": true,
   *   "stock_outs": true,
   *   "reset_kanban_balances": true
   * }
   * Or empty body {} to reset all transactions!
   */
  static async resetData(req: Request, res: Response, next: NextFunction) {
    try {
      const options: ResetOptions = req.body || {};
      const result = await ResetService.resetData(options);
      sendSuccess(res, 200, "Reset data berhasil dijalankan", result);
    } catch (e) {
      next(e);
    }
  }

  static async resetAll(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ResetService.resetAll();
      sendSuccess(res, 200, "Semua data transaksi (PO, PR, Manual PO, Stock In, Stock Out) berhasil direset", result);
    } catch (e) {
      next(e);
    }
  }

  static async resetPurchaseOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ResetService.resetPurchaseOrders();
      sendSuccess(res, 200, "Data Purchase Orders berhasil direset", result);
    } catch (e) {
      next(e);
    }
  }

  static async resetPurchaseRequests(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ResetService.resetPurchaseRequests();
      sendSuccess(res, 200, "Data Purchase Requests berhasil direset", result);
    } catch (e) {
      next(e);
    }
  }

  static async resetManualPurchaseOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ResetService.resetManualPurchaseOrders();
      sendSuccess(res, 200, "Data Manual Purchase Orders berhasil direset", result);
    } catch (e) {
      next(e);
    }
  }

  static async resetStockIns(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ResetService.resetStockIns();
      sendSuccess(res, 200, "Data Stock In berhasil direset", result);
    } catch (e) {
      next(e);
    }
  }

  static async resetStockOuts(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ResetService.resetStockOuts();
      sendSuccess(res, 200, "Data Stock Out berhasil direset", result);
    } catch (e) {
      next(e);
    }
  }
}
