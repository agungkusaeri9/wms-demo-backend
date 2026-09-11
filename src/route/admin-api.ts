import express from "express";
import { authMiddleware } from "../middleware/auth-middleware";
import { UserController } from "../controller/user-controller";
import { OperatorController } from "../controller/operator-controller";
import { MachineAreaController } from "../controller/machine-area-controller";
import { RackController } from "../controller/rack-controller";
import { KanbanController } from "../controller/kanban-controller";
import { SupplierController } from "../controller/supplier-controller";
import { MakerController } from "../controller/Maker-controller";
import { MachineController } from "../controller/machine-controller";
import { StockOutController } from "../controller/stock-out-controller";
import { GroupController } from "../controller/group-controller";
import { RequesterController } from "../controller/requester-controller";
import { SubMachineController } from "../controller/submachine-controller";
import { roleMiddleware } from "../middleware/role-middleware";
import { ManualPurchaseOrderController } from "../controller/manual-purchase-order-controller";
import { KanbanStaggingController } from "../controller/kanban-stagging-controller";
import { PurchaseOrderController } from "../controller/purchase-order-controller";
import { PurchaseRequestController } from "../controller/purchase-request-controller";
import { ResetController } from "../controller/reset-controller";
import { SimulationController } from "../controller/simulation-controller";
import { ReceivingReportController } from "../controller/receiving-report-controller";

export const adminRouter = express.Router();
adminRouter.use(authMiddleware);
adminRouter.use(roleMiddleware);

// Simulation Endpoints
adminRouter.post("/api/simulation/full-flow", SimulationController.simulateFullFlow);
adminRouter.post("/api/kanbans/simulate-full-flow", SimulationController.simulateFullFlow);

// Reset Data Endpoints
adminRouter.post("/api/reset-data", ResetController.resetData);
adminRouter.post("/api/reset/all", ResetController.resetAll);
adminRouter.post("/api/reset/purchase-orders", ResetController.resetPurchaseOrders);
adminRouter.post("/api/reset/purchase-requests", ResetController.resetPurchaseRequests);
adminRouter.post("/api/reset/manual-purchase-orders", ResetController.resetManualPurchaseOrders);
adminRouter.post("/api/reset/stock-in", ResetController.resetStockIns);
adminRouter.post("/api/reset/stock-out", ResetController.resetStockOuts);

// Operator
adminRouter.post("/api/operators", OperatorController.create);
adminRouter.put("/api/operators/:id", OperatorController.update);
adminRouter.delete("/api/operators/:id", OperatorController.remove);

// Requester
adminRouter.post("/api/requesters", RequesterController.create);
adminRouter.put("/api/requesters/:id", RequesterController.update);
adminRouter.delete("/api/requesters/:id", RequesterController.remove);

// Group
adminRouter.post("/api/groups", GroupController.create);
adminRouter.put("/api/groups/:id", GroupController.update);
adminRouter.delete("/api/groups/:id", GroupController.remove);

// Machine Area
adminRouter.post("/api/machine-areas", MachineAreaController.create);
adminRouter.put("/api/machine-areas/:id", MachineAreaController.update);
adminRouter.delete("/api/machine-areas/:id", MachineAreaController.remove);

// Rack
adminRouter.post("/api/racks", RackController.create);
adminRouter.put("/api/racks/:id", RackController.update);
adminRouter.delete("/api/racks/:id", RackController.remove);

// Kanban
adminRouter.post("/api/kanbans", KanbanController.create);
adminRouter.put("/api/kanbans/:id", KanbanController.update);
adminRouter.delete("/api/kanbans/:id", KanbanController.remove);
adminRouter.get(
  "/api/kanbans/export/excel",
  KanbanController.exportKanbanToExcel
);
adminRouter.get(
  "/api/kanbans/export/excel/balance",
  KanbanController.exportBalanceToExcel
);
adminRouter.patch("/api/kanbans/:id/restore", KanbanController.restoreKanban);
adminRouter.post("/api/kanbans/stock-counters", KanbanController.updateStockCounters);
adminRouter.patch("/api/kanbans/stock-counters", KanbanController.updateStockCounters);

// Supplier
adminRouter.post("/api/suppliers", SupplierController.create);
adminRouter.put("/api/suppliers/:id", SupplierController.update);
adminRouter.delete("/api/suppliers/:id", SupplierController.remove);

// Maker
adminRouter.post("/api/makers", MakerController.create);
adminRouter.put("/api/makers/:id", MakerController.update);
adminRouter.delete("/api/makers/:id", MakerController.remove);

// Machine
adminRouter.post("/api/machines", MachineController.create);
adminRouter.put("/api/machines/:id", MachineController.update);
adminRouter.delete("/api/machines/:id", MachineController.remove);

// Sub Machine
adminRouter.post("/api/sub-machines", SubMachineController.create);
adminRouter.put("/api/sub-machines/:id", SubMachineController.update);
adminRouter.delete("/api/sub-machines/:id", SubMachineController.remove);

// Stock Out
adminRouter.patch("/api/stock-outs/:id", StockOutController.update);
// Manual Purchase Order
adminRouter.post(
  "/api/manual-purchase-orders",
  ManualPurchaseOrderController.create
);

//Kanban Stagging
adminRouter.get("/api/kanban-staggings", KanbanStaggingController.get);
adminRouter.get("/api/kanban-staggings/:id", KanbanStaggingController.show);
adminRouter.post(
  "/api/kanban-staggings/assign-to-parent",
  KanbanStaggingController.assignToParent
);
adminRouter.post(
  "/api/kanban-staggings/forward-to-master",
  KanbanStaggingController.forwardToMaster
);

// Purchase Order
adminRouter.get("/api/purchase-orders/next-sequence", PurchaseOrderController.getNextSequence);
adminRouter.get("/api/purchase-orders/template", PurchaseOrderController.downloadTemplate);
adminRouter.post("/api/purchase-orders/import", PurchaseOrderController.importExcel);

// Purchase Request
adminRouter.get("/api/purchase-requests/next-sequence", PurchaseRequestController.getNextSequence);
adminRouter.get("/api/purchase-requests/template", PurchaseRequestController.downloadTemplate);
adminRouter.post("/api/purchase-requests/import", PurchaseRequestController.importExcel);

// Receiving Report
adminRouter.get("/api/receiving-reports", ReceivingReportController.get);
adminRouter.get("/api/receiving-reports/next-sequence", ReceivingReportController.getNextSequence);
adminRouter.get("/api/receiving-reports/template", ReceivingReportController.downloadTemplate);
adminRouter.get("/api/receiving-reports/:id", ReceivingReportController.show);
adminRouter.post("/api/receiving-reports/import", ReceivingReportController.importExcel);
