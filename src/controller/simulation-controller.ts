import { Request, Response, NextFunction } from "express";
import { SimulationService } from "../service/simulation-service";
import { sendSuccess } from "../helper/response-helper";

export class SimulationController {
  static async simulateFullFlow(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const response = await SimulationService.simulateFullFlow();
      sendSuccess(
        res,
        200,
        "Simulasi Alur Penuh (PR -> PO -> RR -> Stock Counters) berhasil dijalankan",
        response
      );
    } catch (e) {
      next(e);
    }
  }
}
