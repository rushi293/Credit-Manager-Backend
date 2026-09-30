import { Router } from 'express';
import { getBills, getBillById, createBill, updateBill, archiveBill, deleteBill } from '../controllers/bill.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', getBills);
router.post('/', createBill);
router.get('/:id', getBillById);
router.put('/:id', updateBill);
router.put('/:id/archive', archiveBill);
router.delete('/:id', deleteBill);

export default router;
