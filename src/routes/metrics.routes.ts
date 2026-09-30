import { Router } from 'express';
import { getMetricsByDateRange, upsertMetric } from '../controllers/metrics.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', getMetricsByDateRange);
router.post('/', upsertMetric);

export default router;
