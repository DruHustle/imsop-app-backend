import { Router } from 'express';
import { z } from 'zod';
import { ingestLogisticsEvent } from '../controllers/logisticsIntegrationController';
import { authenticateLogisticsWebhook } from '../middleware/logisticsWebhookAuth';
import { validateBody } from '../middleware/validate';

const router = Router();
const eventSchema = z.object({
  eventId: z.string().min(1).max(100),
  eventType: z.enum(['shipment.created', 'shipment.updated', 'shipment.location', 'shipment.delivered', 'shipment.exception']),
  trackingNumber: z.string().min(1).max(100),
  status: z.string().min(1).max(50),
  occurredAt: z.string().datetime(),
  origin: z.string().max(255).optional(),
  destination: z.string().max(255).optional(),
  carrier: z.string().max(100).optional(),
  transportMode: z.enum(['road', 'rail', 'air', 'sea', 'parcel', 'other']).optional(),
  estimatedArrival: z.string().datetime().optional(),
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    label: z.string().max(255).optional(),
  }).optional(),
}).strict();

router.post('/:provider/events', authenticateLogisticsWebhook, validateBody(eventSchema), ingestLogisticsEvent);

export default router;
