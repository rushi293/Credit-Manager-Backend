import { Router } from 'express';
import { getDashboardData } from '../controllers/dashboard.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', getDashboardData);

export default router;
