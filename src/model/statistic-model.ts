export type StockStat = {
    [key: string]: number; // contoh: { "2025-06-01": 120 }
};

// Tipe data return dari MainService.get()
export type Stats = {
    // Summary cards
    totalStockUnit: number;   // SUM(balance) dari semua kanban aktif
    totalSku: number;         // COUNT total kanban (SKU unik)
    inboundToday: number;     // Total qty stock in hari ini
    outboundToday: number;    // Total qty stock out hari ini

    // Status stok
    overStock: number;
    underStock: number;
    unBalanced: number;
    unProcessed: number;

    // Chart data
    stockIn: {
        daily: StockStat;
        weekly: StockStat;
        monthly: StockStat;
    };
    stockOut: {
        daily: StockStat;
        weekly: StockStat;
        monthly: StockStat;
    };
};