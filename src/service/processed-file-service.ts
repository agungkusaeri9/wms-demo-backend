import { ProcessedFileResponse, CreateProcessedFileRequest, toProcessedFileResponse } from "../model/processed-file-model";
import { Validation } from "../validation/validation";
import { ProcessedFileValidation } from "../validation/processed-file-validation";
import { ProcessedFile } from "@prisma/client";
import { prismaClient } from "../application/database";
import { logger } from "../application/logging";
import { ResponseError } from "../error/response-error";
import { Pageable } from "../model/page";


export class ProcessedFileService {

    static async create(request: CreateProcessedFileRequest): Promise<ProcessedFileResponse> {
        const createRequest = Validation.validate(ProcessedFileValidation.CREATE, request);


        const isCodeExist = await prismaClient.processedFile.findFirst({
            where: {
                file_name: createRequest.file_name,
                type: createRequest.type
            }
        });

        if (isCodeExist) {
            logger.error(`ProcessedFile with file_name ${createRequest.file_name} and type ${createRequest.type} already exists`);
            throw new ResponseError(400, "ProcessedFile already exists");
        }

        const processedFile = await prismaClient.processedFile.create({
            data: createRequest
        });

        return toProcessedFileResponse(processedFile);
    }



    static async isAlreadyExist(file_name: string, type: string): Promise<boolean> {

        if (!file_name || !type) {
            throw new ResponseError(400, "File name and type must be provided");
        }

        const processedFile = await prismaClient.processedFile.findUnique({
            where: {
                file_name: file_name,
                type: type
            }
        });

        if (processedFile) {
            return true;
        }

        return false;
    }

    static async getNextSequence(type: string, targetDateStr?: string): Promise<{
        date: string;
        dateFormatted: string;
        sequence: number;
        filename: string;
    }> {
        let dateObj = new Date();
        if (targetDateStr) {
            // Handle YYYY-MM-DD or DD-MM-YYYY
            const parsed = new Date(targetDateStr);
            if (!isNaN(parsed.getTime())) {
                dateObj = parsed;
            }
        }

        const day = String(dateObj.getDate()).padStart(2, "0");
        const month = String(dateObj.getMonth() + 1).padStart(2, "0");
        const year = String(dateObj.getFullYear());
        const dateFormatted = `${day}${month}${year}`;

        const prefix = `${type}_${dateFormatted}_`;

        const existingFiles = await prismaClient.processedFile.findMany({
            where: {
                type: type,
                file_name: {
                    startsWith: prefix,
                },
            },
            select: {
                file_name: true,
            },
        });

        let maxSeq = 0;
        for (const file of existingFiles) {
            const part = file.file_name.substring(prefix.length);
            const num = parseInt(part, 10);
            if (!isNaN(num) && num > maxSeq) {
                maxSeq = num;
            }
        }

        const nextSequence = maxSeq + 1;
        const suggestedFileName = `${prefix}${nextSequence}`;
        const isoDate = `${year}-${month}-${day}`;

        return {
            date: isoDate,
            dateFormatted,
            sequence: nextSequence,
            filename: suggestedFileName,
        };
    }

    static async recordProcessedFile(file_name: string, type: string): Promise<void> {
        if (!file_name || !type) return;
        const cleanName = file_name.replace(/\.[^/.]+$/, "");

        const exists = await prismaClient.processedFile.findFirst({
            where: {
                file_name: cleanName,
                type: type,
            },
        });

        if (!exists) {
            await prismaClient.processedFile.create({
                data: {
                    file_name: cleanName,
                    type: type,
                },
            });
        }
    }
}


