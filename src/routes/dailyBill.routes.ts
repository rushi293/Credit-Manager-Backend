import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middlewares/auth.middleware';
import {
  getDailyBills,
  createDailyBill,
  updateDailyBill,
  deleteDailyBill,
  importDailyBills,
} from '../controllers/dailyBill.controller';
import { parseBillPdf } from '../controllers/pdfParse.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

router.use(requireAuth);

router.post('/parse-pdf', upload.single('file'), parseBillPdf);
router.post('/import', importDailyBills);
router.get('/', getDailyBills);
router.post('/', createDailyBill);
router.put('/:id', updateDailyBill);
router.delete('/:id', deleteDailyBill);

export default router;
