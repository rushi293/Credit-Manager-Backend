import { Router } from 'express';
import customerRoutes from './customers';
import billRoutes from './bills';
import paymentRoutes from './payments';
import dashboardRoutes from './dashboard';
import attachmentRoutes from './attachment.routes';
import authRoutes from './auth.routes';
import metricsRoutes from './metrics.routes';
import settingsRoutes from './settings.routes';
import adminRoutes from './admin.routes';
import eventsRoutes from './events.routes';

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'API Foundation Ready' });
});

router.use('/auth', authRoutes);
router.use('/customers', customerRoutes);
router.use('/bills', billRoutes);
router.use('/payments', paymentRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/attachments', attachmentRoutes);
router.use('/metrics', metricsRoutes);
router.use('/settings', settingsRoutes);
router.use('/admin', adminRoutes);
router.use('/events', eventsRoutes);

export default router;
