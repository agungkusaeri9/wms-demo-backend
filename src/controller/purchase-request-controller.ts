import { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import { CreatePurchaseRequestRequest, SearchPurchaseRequestRequest } from "../model/purchase-request-model";
import { PurchaseRequestService } from "../service/purchase-request-service";
import { ProcessedFileService } from "../service/processed-file-service";
import { sendSuccess } from "../helper/response-helper";
import { ResponseError } from "../error/response-error";

export class PurchaseRequestController {
    static async getNextSequence(req: Request, res: Response, next: NextFunction) {
        try {
            const date = req.query.date as string | undefined;
            const result = await ProcessedFileService.getNextSequence("PR", date);
            sendSuccess(res, 200, "Get next PR sequence success", result);
        } catch (e) {
            next(e);
        }
    }

    static async get(req: Request, res: Response, next: NextFunction) {
        try {
            const request: SearchPurchaseRequestRequest = {
                keyword: req.query.keyword as string,
                page: isNaN(Number(req.query.page)) ? 1 : Number(req.query.page),
                limit: isNaN(Number(req.query.limit)) ? 10 : Number(req.query.limit),
                paginate: req.query.paginate === "true",
                start_date: typeof req.query.start_date === 'string' ? new Date(req.query.start_date) : undefined,
                end_date: typeof req.query.end_date === 'string' ? new Date(req.query.end_date) : undefined,
            };

            const response = await PurchaseRequestService.get(request);

            sendSuccess(res, 200, "Get PurchaseRequest success", response.data, response.pagination);
        } catch (e) {
            next(e);
        }
    }

    static async show(req: Request, res: Response, next: NextFunction) {
        try {
            const id: number = Number(req.params.id);
            const response = await PurchaseRequestService.show(id);
            sendSuccess(res, 200, "Get PurchaseRequest success", response);
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

            const safeFilename = filename || `PR_${Date.now()}.xlsx`;
            const tempFilePath = path.join(tempDir, `${Date.now()}_${safeFilename}`);
            fs.writeFileSync(tempFilePath, buffer);

            try {
                await PurchaseRequestService.create(tempFilePath);
                if (filename) {
                    await ProcessedFileService.recordProcessedFile(filename, "PR");
                }
            } finally {
                if (fs.existsSync(tempFilePath)) {
                    try {
                        fs.unlinkSync(tempFilePath);
                    } catch {}
                }
            }

            sendSuccess(res, 200, "Import Purchase Request berhasil!");
        } catch (e) {
            next(e);
        }
    }

    static async downloadTemplate(req: Request, res: Response, next: NextFunction) {
        try {
            const possiblePaths = [
                path.resolve(__dirname, "../../template_file/TemplatePurchaseRequest.xlsb"),
                path.join(process.cwd(), "template_file", "TemplatePurchaseRequest.xlsb"),
                path.join(process.cwd(), "..", "wms-demo-backend", "template_file", "TemplatePurchaseRequest.xlsb"),
            ];

            const foundPath = possiblePaths.find((p) => fs.existsSync(p));
            if (!foundPath) {
                throw new ResponseError(404, "File template Purchase Request tidak ditemukan.");
            }

            res.setHeader("Content-Disposition", "attachment; filename=TemplatePurchaseRequest.xlsb");
            res.setHeader("Content-Type", "application/vnd.ms-excel.sheet.binary.macroEnabled.12");
            return res.sendFile(foundPath);
        } catch (e) {
            next(e);
        }
    }
}