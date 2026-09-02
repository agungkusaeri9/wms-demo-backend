import { Request, Response, NextFunction } from "express";
import { prismaClient } from "../application/database";
import { getWebSocketStatus } from "../application/websocket";
import { sendSuccess } from "../helper/response-helper";

export class HealthController {
  static async health(req: Request, res: Response, next: NextFunction) {
    try {
      const startTime = Date.now();

      // Check Database
      let dbStatus = "UP";
      let dbLatencyMs = 0;
      let dbError: string | null = null;

      try {
        const dbStart = Date.now();
        await prismaClient.$queryRaw`SELECT 1`;
        dbLatencyMs = Date.now() - dbStart;
      } catch (err: any) {
        dbStatus = "DOWN";
        dbError = err.message || "Failed to query database";
      }

      // Check WebSocket
      const wsInfo = getWebSocketStatus();

      // Memory Usage
      const memoryUsage = process.memoryUsage();
      const formatMB = (bytes: number) => Math.round((bytes / 1024 / 1024) * 100) / 100;

      const isHealthy = dbStatus === "UP" && wsInfo.status === "UP";
      const isDegraded = dbStatus === "UP" && wsInfo.status !== "UP";
      const overallStatus = isHealthy ? "UP" : isDegraded ? "DEGRADED" : "DOWN";
      const statusCode = dbStatus === "UP" ? 200 : 503;

      const healthData = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
        responseTimeMs: Date.now() - startTime,
        services: {
          database: {
            status: dbStatus,
            latencyMs: dbLatencyMs,
            ...(dbError ? { error: dbError } : {}),
          },
          websocket: wsInfo,
        },
        system: {
          nodeVersion: process.version,
          memory: {
            heapUsedMB: formatMB(memoryUsage.heapUsed),
            heapTotalMB: formatMB(memoryUsage.heapTotal),
            rssMB: formatMB(memoryUsage.rss),
          },
        },
      };

      return sendSuccess(
        res,
        statusCode,
        `System health is ${overallStatus}`,
        healthData
      );
    } catch (e) {
      next(e);
    }
  }
}

