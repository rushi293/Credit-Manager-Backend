import { Router } from 'express';
import { getPayments, createPayment } from '../controllers/payment.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', getPayments);
router.post('/', createPayment);

export default router;
