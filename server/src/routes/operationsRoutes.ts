import { Router } from 'express';
import { getShipments, getOrders, exportShipmentsReport, exportOrdersReport } from '../controllers/operationsController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.get('/shipments', authenticate, authorize(['admin', 'engineer', 'analyst', 'user']), getShipments);
router.get('/orders', authenticate, authorize(['admin', 'engineer', 'analyst']), getOrders);
router.get('/shipments/export/report', authenticate, authorize(['admin', 'analyst']), exportShipmentsReport);
router.get('/orders/export/report', authenticate, authorize(['admin', 'analyst']), exportOrdersReport);

export default router;
