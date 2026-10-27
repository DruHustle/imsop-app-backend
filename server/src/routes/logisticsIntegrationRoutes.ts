import { Router } from "express";
import { z } from "zod";
import { ingestLogisticsEvent } from "../controllers/logisticsIntegrationController";
import { authenticateLogisticsWebhook } from "../middleware/logisticsWebhookAuth";
import { validateBody } from "../middleware/validate";

const router = Router();
const eventSchema = z
  .object({
    eventId: z.string().min(1).max(100),
    eventType: z.enum([
      "shipment.created",
      "shipment.updated",
      "shipment.location",
      "shipment.delivered",
      "shipment.exception",
      "shipment.corrected",
    ]),
    trackingNumber: z.string().min(1).max(100),
    status: z.enum([
      "pending",
      "in_transit",
    "picked_up",
    "out_for_delivery",
      "delivered",
      "delayed",
      "exception",
      "cancelled",
    ]),
    occurredAt: z.string().datetime(),
    origin: z.string().trim().min(1).max(255).optional(),
    destination: z.string().trim().min(1).max(255).optional(),
    carrier: z.string().max(100).nullable().optional(),
    transportMode: z
      .enum(["road", "rail", "air", "sea", "parcel", "other"])
      .nullable()
      .optional(),
    estimatedArrival: z.string().datetime().nullable().optional(),
    actualArrival: z.string().datetime().nullable().optional(),
    location: z
      .object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        label: z.string().trim().min(1).max(255).optional(),
      })
      .nullable()
      .optional(),
  })
  .strict()
  .refine(
    (event) =>
      event.eventType !== "shipment.delivered" ||
      (event.status === "delivered" && typeof event.actualArrival === "string"),
    {
      message:
        "Delivery events require explicit actualArrival and delivered status",
    },
  );

router.post(
  "/:provider/events",
  authenticateLogisticsWebhook,
  validateBody(eventSchema),
  ingestLogisticsEvent,
);

export default router;
