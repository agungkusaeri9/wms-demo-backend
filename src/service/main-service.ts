import { prismaClient } from "../application/database";
import { StockStat, Stats } from "../model/statistic-model";
import { getISOWeek, getYear } from "date-fns";

export class MainService {
    static async get(): Promise<Stats> {

        // ── Tanggal helpers ──────────────────────────────────────────────────
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        const dailyFrom = new Date();
        dailyFrom.setDate(dailyFrom.getDate() - 30);

        const weekFrom = new Date();
        weekFrom.setMonth(weekFrom.getMonth() - 3);

        const yearStart = new Date(now.getFullYear(), 0, 1);

        // ── Summary cards (parallel queries) ─────────────────────────────────
        const [
            totalStockUnitResult,
            totalSku,
            inboundTodayResult,
            outboundTodayResult,
            overStockList,
            underStockList,
            unBalancedList,
            kanbans,
        ] = await Promise.all([
            // Total unit stok: SUM semua balance kanban
            prismaClient.kanban.aggregate({
                _sum: { balance: true },
            }),

            // Total SKU: COUNT semua kanban
            prismaClient.kanban.count(),

            // Inbound hari ini: SUM qty stock in hari ini
            prismaClient.stockIn.aggregate({
                _sum: { quantity: true },
                where: { created_at: { gte: todayStart, lte: todayEnd } },
            }),

            // Outbound hari ini: SUM qty stock out hari ini
            prismaClient.stockOut.aggregate({
                _sum: { quantity: true },
                where: { created_at: { gte: todayStart, lte: todayEnd } },
            }),

            // Over stock
            prismaClient.kanban.findMany({
                where: { balance: { gt: prismaClient.kanban.fields.max_quantity } },
            }),

            // Under stock (kritis)
            prismaClient.kanban.findMany({
                where: { balance: { lt: prismaClient.kanban.fields.min_quantity } },
            }),

            // Unbalanced
            prismaClient.kanban.findMany({
                where: { balance: { lt: prismaClient.kanban.fields.js_ending_quantity } },
            }),

            // Kanbans under stock dengan PO/PR detail (untuk unProcessed)
            prismaClient.kanban.findMany({
                where: { balance: { lt: prismaClient.kanban.fields.min_quantity } },
                include: {
                    purchase_order_detail: true,
                    purchase_request_detail: true,
                },
            }),
        ]);

        const unProcessed = kanbans.filter(
            (k) =>
                k.min_quantity && k.balance < k.min_quantity &&
                k.purchase_order_detail.filter((po) => po.is_active).length === 0 &&
                k.purchase_request_detail.filter((pr) => pr.is_active).length === 0
        ).length;

        // ── Chart data ───────────────────────────────────────────────────────
        const [
            stockInDailyRaw,
            stockOutDailyRaw,
            stockInWeeklyRaw,
            stockOutWeeklyRaw,
            stockInMonthlyRaw,
            stockOutMonthlyRaw,
        ] = await Promise.all([
            prismaClient.stockIn.findMany({
                where: { created_at: { gte: dailyFrom } },
                select: { created_at: true, quantity: true },
            }),
            prismaClient.stockOut.findMany({
                where: { created_at: { gte: dailyFrom } },
                select: { created_at: true, quantity: true },
            }),
            prismaClient.stockIn.findMany({
                where: { created_at: { gte: weekFrom } },
                select: { created_at: true, quantity: true },
            }),
            prismaClient.stockOut.findMany({
                where: { created_at: { gte: weekFrom } },
                select: { created_at: true, quantity: true },
            }),
            prismaClient.stockIn.findMany({
                where: { created_at: { gte: yearStart } },
                select: { created_at: true, quantity: true },
            }),
            prismaClient.stockOut.findMany({
                where: { created_at: { gte: yearStart } },
                select: { created_at: true, quantity: true },
            }),
        ]);

        // ── Group helpers ────────────────────────────────────────────────────
        const groupByDate = (data: { created_at: Date; quantity: number }[]): StockStat =>
            data.reduce((acc: StockStat, item) => {
                const key = item.created_at.toISOString().split("T")[0];
                acc[key] = (acc[key] || 0) + item.quantity;
                return acc;
            }, {});

        const groupByWeek = (data: { created_at: Date; quantity: number }[]): StockStat =>
            data.reduce((acc: StockStat, item) => {
                const week = getISOWeek(item.created_at);
                const year = getYear(item.created_at);
                acc[`${year}-W${week}`] = (acc[`${year}-W${week}`] || 0) + item.quantity;
                return acc;
            }, {});

        const groupByMonth = (data: { created_at: Date; quantity: number }[]): StockStat =>
            data.reduce((acc: StockStat, item) => {
                const key = item.created_at.toISOString().slice(0, 7); // YYYY-MM
                acc[key] = (acc[key] || 0) + item.quantity;
                return acc;
            }, {});

        return {
            // Summary cards
            totalStockUnit: totalStockUnitResult._sum.balance ?? 0,
            totalSku,
            inboundToday:  inboundTodayResult._sum.quantity  ?? 0,
            outboundToday: outboundTodayResult._sum.quantity ?? 0,

            // Status stok
            overStock:   overStockList.length,
            underStock:  underStockList.length,
            unBalanced:  unBalancedList.length,
            unProcessed,

            // Chart data
            stockIn: {
                daily:   groupByDate(stockInDailyRaw),
                weekly:  groupByWeek(stockInWeeklyRaw),
                monthly: groupByMonth(stockInMonthlyRaw),
            },
            stockOut: {
                daily:   groupByDate(stockOutDailyRaw),
                weekly:  groupByWeek(stockOutWeeklyRaw),
                monthly: groupByMonth(stockOutMonthlyRaw),
            },
        };
    }
}
