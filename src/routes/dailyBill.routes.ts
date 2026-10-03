import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import {
  getDailyBills,
  createDailyBill,
  updateDailyBill,
  deleteDailyBill,
} from '../controllers/dailyBill.controller';

const router = Router();

router.use(requireAuth);

router.get('/', getDailyBills);
router.post('/', createDailyBill);
router.put('/:id', updateDailyBill);
router.delete('/:id', deleteDailyBill);

export default router;
