import { Response, NextFunction } from "express";
import { UserRequest } from "../type/user-request";
import { ActivityService } from "../service/activity-service";
import { sendSuccess } from "../helper/response-helper";

export class ActivityController {
  static async getRecent(req: UserRequest, res: Response, next: NextFunction) {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 10;
      const type = req.query.type as "STOCK_IN" | "STOCK_OUT" | "ALL" | undefined;
      
      // Jika filter by_user=true atau operator_id dispesifikasikan
      let operatorId: number | undefined;
      if (req.query.operator_id) {
        operatorId = Number(req.query.operator_id);
      } else if (req.query.by_user === "true" && req.operatorId) {
        operatorId = req.operatorId;
      }

      const response = await ActivityService.getRecentActivities({
        limit,
        operatorId,
        type,
      });

      sendSuccess(res, 200, "Get Recent Activities success", response);
    } catch (e) {
      next(e);
    }
  }
}
