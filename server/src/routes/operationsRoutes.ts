import { Router } from "express";
import { sapMetadata } from "../controllers/integrations";
import {
  exportShipmentsReport,
  exportOrdersReport,
} from "../controllers/operationsController";
import { authenticate, authorize, requireWorkspace } from "../middleware/auth";
import {
  shipmentSummary,
  boundedList,
  recordDetail,
  shipmentEvents,
} from "../controllers/operationalReads";

import { z } from "zod";
import { validateBody } from "../middleware/validate";
import {
  reviewFeed,
  reviewHistory,
  actOnReview,
  notifications,
  readNotification,
  integrationStatus,
  operators,
} from "../controllers/reviews";
import {
  notificationPreferences,
  updateNotificationPreferences,
} from "../controllers/notificationPreferences";
import {
  forecastStatus,
  importObservations,
  runForecast,
  observationInput,
  forecastInput,
} from "../controllers/forecasts";
const router = Router();
router.get("/integrations/sap/metadata", authenticate, requireWorkspace, authorize(["admin", "engineer"]), sapMetadata);
router.get(
  "/forecasts",
  authenticate,
  requireWorkspace,
  authorize(["admin", "engineer", "analyst"]),
  forecastStatus,
);
router.post(
  "/forecasts/observations",
  authenticate,
  requireWorkspace,
  authorize(["admin", "engineer"]),
  validateBody(observationInput),
  importObservations,
);
router.post(
  "/forecasts",
  authenticate,
  requireWorkspace,
  authorize(["admin", "engineer", "analyst"]),
  validateBody(forecastInput),
  runForecast,
);
router.get(
  "/notifications/preferences",
  authenticate,
  requireWorkspace,
  notificationPreferences,
);
router.put(
  "/notifications/preferences",
  authenticate,
  requireWorkspace,
  validateBody(z.object({ emailEnabled: z.boolean() }).strict()),
  updateNotificationPreferences,
);
router.get(
  "/shipments/summary",
  authenticate,
  requireWorkspace,
  authorize(["admin", "engineer", "analyst", "user"]),
  shipmentSummary,
);
router.get(
  "/reports/access",
  authenticate,
  requireWorkspace,
  authorize(["admin", "analyst"]),
  (_req, res) => res.json({ allowed: true }),
);

router.get(
  "/shipments",
  authenticate,
  requireWorkspace,
  authorize(["admin", "engineer", "analyst", "user"]),
  boundedList("shipments"),
);
router.get(
  "/orders",
  authenticate,
  requireWorkspace,
  authorize(["admin", "engineer", "analyst"]),
  boundedList("orders"),
);
router.get(
  "/shipments/export/report",
  authenticate,
  requireWorkspace,
  authorize(["admin", "analyst"]),
  exportShipmentsReport,
);
router.get(
  "/orders/export/report",
  authenticate,
  requireWorkspace,
  authorize(["admin", "analyst"]),
  exportOrdersReport,
);
router.get(
  "/shipments/:id/events",
  authenticate,
  requireWorkspace,
  authorize(["admin", "engineer", "analyst", "user"]),
  shipmentEvents,
);
router.get(
  "/shipments/:id",
  authenticate,
  requireWorkspace,
  authorize(["admin", "engineer", "analyst", "user"]),
  recordDetail("shipments"),
);
router.get(
  "/orders/:id",
  authenticate,
  requireWorkspace,
  authorize(["admin", "engineer", "analyst"]),
  recordDetail("orders"),
);

router.get(
  "/reviews",
  authenticate,
  requireWorkspace,
  authorize(["admin", "engineer", "analyst"]),
  reviewFeed,
);
router.get(
  "/reviews/operators",
  authenticate,
  requireWorkspace,
  authorize(["admin", "engineer"]),
  operators,
);
router.get(
  "/reviews/:id/actions",
  authenticate,
  requireWorkspace,
  authorize(["admin", "engineer", "analyst"]),
  reviewHistory,
);
router.post(
  "/reviews/:id/actions",
  authenticate,
  requireWorkspace,
  authorize(["admin", "engineer"]),
  validateBody(
    z
      .object({
        action: z.enum(["acknowledge", "assign", "note", "resolve", "reopen"]),
        version: z.number().int().nonnegative(),
        note: z.string().trim().min(1).max(2000).optional(),
        assigneeId: z.number().int().positive().nullable().optional(),
      })
      .strict()
      .refine((v) => v.action !== "note" || !!v.note)
      .refine((v) => v.action !== "assign" || v.assigneeId !== undefined),
  ),
  actOnReview,
);
router.get("/notifications", authenticate, requireWorkspace, notifications);
router.post(
  "/notifications/:id/read",
  authenticate,
  requireWorkspace,
  readNotification,
);
router.get(
  "/integrations",
  authenticate,
  requireWorkspace,
  authorize(["admin", "engineer"]),
  integrationStatus,
);
export default router;
