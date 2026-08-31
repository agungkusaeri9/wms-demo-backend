import express from "express";
import { publicRouter } from "../route/public-api";
import { errorMiddleware } from "../middleware/error-middleware";
import { apiRouter } from "../route/api";
import cors from "cors";
import { adminRouter } from "../route/admin-api";

export const web = express();
web.use(express.json({ limit: "50mb" }));
web.use(express.urlencoded({ extended: true, limit: "50mb" }));
web.use(cors());
web.use(publicRouter);
web.use(apiRouter);
web.use(adminRouter);
web.use(errorMiddleware);
