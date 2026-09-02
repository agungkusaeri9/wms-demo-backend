export type ActivityItem = {
  id: string;
  type: "STOCK_IN" | "STOCK_OUT";
  title: string;
  subtitle: string;
  kanbanCode: string | null;
  quantity: number;
  operatorName: string | null;
  requesterName: string | null;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: Date;
};

export type GetActivitiesQuery = {
  limit?: number;
  operatorId?: number;
  type?: "STOCK_IN" | "STOCK_OUT" | "ALL";
};
