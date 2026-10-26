import { Router } from "express";
import {
  exportShipmentsReport,
  exportOrdersReport,
} from "../controllers/operationsController";
import { authenticate, authorize } from "../middleware/auth";
import {
  boundedList,
  recordDetail,
  shipmentEvents,
} from "../controllers/operationalReads";

const router = Router();
router.get(
  "/reports/access",
  authenticate,
  authorize(["admin", "analyst"]),
  (_req, res) => res.json({ allowed: true }),
);

router.get(
  "/shipments",
  authenticate,
  authorize(["admin", "engineer", "analyst", "user"]),
  boundedList("shipments"),
);
router.get(
  "/orders",
  authenticate,
  authorize(["admin", "engineer", "analyst"]),
  boundedList("orders"),
);
router.get(
  "/shipments/export/report",
  authenticate,
  authorize(["admin", "analyst"]),
  exportShipmentsReport,
);
router.get(
  "/orders/export/report",
  authenticate,
  authorize(["admin", "analyst"]),
  exportOrdersReport,
);
router.get(
  "/shipments/:id/events",
  authenticate,
  authorize(["admin", "engineer", "analyst", "user"]),
  shipmentEvents,
);
router.get(
  "/shipments/:id",
  authenticate,
  authorize(["admin", "engineer", "analyst", "user"]),
  recordDetail("shipments"),
);
router.get(
  "/orders/:id",
  authenticate,
  authorize(["admin", "engineer", "analyst"]),
  recordDetail("orders"),
);

export default router;
