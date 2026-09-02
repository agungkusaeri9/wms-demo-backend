import { prismaClient } from "../application/database";
import { ActivityItem, GetActivitiesQuery } from "../model/activity-model";

export class ActivityService {
  static async getRecentActivities(
    query: GetActivitiesQuery
  ): Promise<ActivityItem[]> {
    const limit = query.limit && query.limit > 0 ? Number(query.limit) : 10;
    const operatorId = query.operatorId ? Number(query.operatorId) : undefined;
    const type = query.type || "ALL";

    const fetchStockIn = type === "ALL" || type === "STOCK_IN";
    const fetchStockOut = type === "ALL" || type === "STOCK_OUT";

    const [stockIns, stockOuts] = await Promise.all([
      fetchStockIn
        ? prismaClient.stockIn.findMany({
            where: operatorId ? { operator_id: operatorId } : undefined,
            orderBy: { created_at: "desc" },
            take: limit,
            include: {
              operator: true,
              kanban: true,
            },
          })
        : Promise.resolve([]),
      fetchStockOut
        ? prismaClient.stockOut.findMany({
            where: operatorId ? { operator_id: operatorId } : undefined,
            orderBy: { created_at: "desc" },
            take: limit,
            include: {
              operator: true,
              requester: true,
              kanban: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const activities: ActivityItem[] = [
      ...stockIns.map((item) => ({
        id: `IN-${item.id}`,
        type: "STOCK_IN" as const,
        title: `Penerimaan Barang • ${item.kanban_code || "SKU"}`,
        subtitle: `Operator: ${item.operator?.name || "Operator"} • ${item.quantity} Unit`,
        kanbanCode: item.kanban_code,
        quantity: item.quantity,
        operatorName: item.operator?.name || null,
        requesterName: null,
        balanceBefore: item.balance_before,
        balanceAfter: item.balance_after,
        createdAt: item.created_at,
      })),
      ...stockOuts.map((item) => ({
        id: `OUT-${item.id}`,
        type: "STOCK_OUT" as const,
        title: `Pengeluaran Barang • ${item.kanban_code || "SKU"}`,
        subtitle: `${item.requester ? `Requester: ${item.requester.name}` : `Operator: ${item.operator?.name || "Operator"}`} • ${item.quantity} Unit`,
        kanbanCode: item.kanban_code,
        quantity: item.quantity,
        operatorName: item.operator?.name || null,
        requesterName: item.requester?.name || null,
        balanceBefore: item.balance_before,
        balanceAfter: item.balance_after,
        createdAt: item.created_at,
      })),
    ];

    // Sort descending berdasarkan created_at
    activities.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return activities.slice(0, limit);
  }
}
