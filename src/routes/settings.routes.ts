import { Router } from 'express';
import { updateSettings } from '../controllers/settings.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);
router.put('/', updateSettings);

export default router;
