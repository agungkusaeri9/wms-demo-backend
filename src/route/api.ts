import express from "express";
import { authMiddleware } from "../middleware/auth-middleware";
import { UserController } from "../controller/user-controller";
import { StockOutController } from "../controller/stock-out-controller";
import { StockInController } from "../controller/stock-in-controller";
import { ActivityController } from "../controller/activity-controller";

export const apiRouter = express.Router();
apiRouter.use(authMiddleware);

// User
apiRouter.get("/api/users/current", UserController.get);
apiRouter.patch("/api/users/current", UserController.update);

// Activities (Stock In & Stock Out)
apiRouter.get("/api/activities", ActivityController.getRecent);

// Stock In
apiRouter.post("/api/stock-ins", StockInController.create);

// Stock Out
apiRouter.post("/api/stock-outs", StockOutController.create);
apiRouter.post("/api/stock-outs/multiples", StockOutController.createMany);

