import { Router } from 'express';
import { login, getMe, updateCredentials, createStaffUser } from '../controllers/auth.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

// Registration is disabled to enforce single-user login
// router.post('/register', register);
router.post('/login', login);

router.get('/me', requireAuth, getMe);
router.put('/credentials', requireAuth, updateCredentials);
router.post('/staff', requireAuth, createStaffUser);

export default router;
