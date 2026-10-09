import { Router } from 'express';
import { getTelemetry, postTelemetry } from '../controllers/telemetryController';
import { authenticate, authorize } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

router.get('/', authenticate, authorize(['admin', 'engineer', 'analyst']), getTelemetry);
router.post('/', authenticate, authorize(['admin', 'engineer']), validateBody(z.object({
  deviceId: z.string().min(1).max(100), metricName: z.string().min(1).max(100), metricValue: z.coerce.number().finite(),
})), postTelemetry);

export default router;
