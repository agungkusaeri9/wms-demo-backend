import { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import { CreatePurchaseOrderRequest, SearchPurchaseOrderRequest } from "../model/purchase-order-model";
import { PurchaseOrderService } from "../service/purchase-order-service";
import { ProcessedFileService } from "../service/processed-file-service";
import { sendSuccess } from "../helper/response-helper";
import { ResponseError } from "../error/response-error";

export class PurchaseOrderController {
    static async getNextSequence(req: Request, res: Response, next: NextFunction) {
        try {
            const date = req.query.date as string | undefined;
            const result = await ProcessedFileService.getNextSequence("PO", date);
            sendSuccess(res, 200, "Get next PO sequence success", result);
        } catch (e) {
            next(e);
        }
    }

    static async get(req: Request, res: Response, next: NextFunction) {
        try {
            const request: SearchPurchaseOrderRequest = {
                keyword: req.query.keyword as string,
                page: isNaN(Number(req.query.page)) ? 1 : Number(req.query.page),
                limit: isNaN(Number(req.query.limit)) ? 10 : Number(req.query.limit),
                paginate: req.query.paginate === "true",
                start_date: typeof req.query.start_date === 'string' ? new Date(req.query.start_date) : undefined,
                end_date: typeof req.query.end_date === 'string' ? new Date(req.query.end_date) : undefined,
            };

            const response = await PurchaseOrderService.get(request);

            sendSuccess(res, 200, "Get PurchaseOrder success", response.data, response.pagination);
        } catch (e) {
            next(e);
        }
    }

    static async show(req: Request, res: Response, next: NextFunction) {
        try {
            const id: number = Number(req.params.id);
            const response = await PurchaseOrderService.show(id);
            sendSuccess(res, 200, "Get PurchaseOrder success", response);
        } catch (e) {
            next(e);
        }
    }

    static async importExcel(req: Request, res: Response, next: NextFunction) {
        try {
            const { file, filename } = req.body;
            if (!file) {
                throw new ResponseError(400, "File excel wajib diunggah.");
            }

            const base64Data = file.replace(/^data:.*?;base64,/, "");
            const buffer = Buffer.from(base64Data, "base64");

            const tempDir = path.join(process.cwd(), "temp");
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            const safeFilename = filename || `PO_${Date.now()}.xlsx`;
            const tempFilePath = path.join(tempDir, `${Date.now()}_${safeFilename}`);
            fs.writeFileSync(tempFilePath, buffer);

            try {
                await PurchaseOrderService.create(tempFilePath);
                if (filename) {
                    await ProcessedFileService.recordProcessedFile(filename, "PO");
                }
            } finally {
                if (fs.existsSync(tempFilePath)) {
                    try {
                        fs.unlinkSync(tempFilePath);
                    } catch {}
                }
            }

            sendSuccess(res, 200, "Import Purchase Order berhasil!");
        } catch (e) {
            next(e);
        }
    }

    static async downloadTemplate(req: Request, res: Response, next: NextFunction) {
        try {
            const possiblePaths = [
                path.resolve(__dirname, "../../template_file/TemplatePurchaseOrder.xlsb"),
                path.join(process.cwd(), "template_file", "TemplatePurchaseOrder.xlsb"),
                path.join(process.cwd(), "..", "wms-demo-backend", "template_file", "TemplatePurchaseOrder.xlsb"),
            ];

            const foundPath = possiblePaths.find((p) => fs.existsSync(p));
            if (!foundPath) {
                throw new ResponseError(404, "File template Purchase Order tidak ditemukan.");
            }

            res.setHeader("Content-Disposition", "attachment; filename=TemplatePurchaseOrder.xlsb");
            res.setHeader("Content-Type", "application/vnd.ms-excel.sheet.binary.macroEnabled.12");
            return res.sendFile(foundPath);
        } catch (e) {
            next(e);
        }
    }
}