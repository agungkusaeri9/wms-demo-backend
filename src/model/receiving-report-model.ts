import { Kanban } from "@prisma/client";

export type ReceivingReportRawEntry = {
    [key: string]: any;
    "Product Code"?: any;
    Received?: any;
};

export type CreateReceivingReportRequest = {
    kanban_code: string;
    received_quantity: number;
};

export type ReceivingReportResponse = {
    id: number;
    kanban_code: string | null;
    received_quantity: number;
    created_at: Date;
    updated_at: Date;
    Kanban?: Kanban | null;
};

export type SearchReceivingReportRequest = {
    keyword?: string;
    kanban?: string;
    page: number;
    limit: number;
    paginate?: boolean;
    start_date?: Date;
    end_date?: Date;
};

export function toReceivingReportResponse(report: any): ReceivingReportResponse {
    return {
        id: report.id,
        kanban_code: report.kanban_code,
        received_quantity: report.received_quantity,
        created_at: report.created_at,
        updated_at: report.updated_at,
        Kanban: report.Kanban || null,
    };
}
