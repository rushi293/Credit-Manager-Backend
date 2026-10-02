import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import {
  getLoginSessions,
  logoutSession,
  getNonAdmins,
  updateNonAdmin,
  deleteNonAdmin
} from '../controllers/admin.controller';

const router = Router();

router.use(requireAuth);

router.get('/sessions', getLoginSessions);
router.post('/sessions/:id/logout', logoutSession);

router.get('/users', getNonAdmins);
router.patch('/users/:id', updateNonAdmin);
router.delete('/users/:id', deleteNonAdmin);

export default router;