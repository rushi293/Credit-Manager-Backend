import { Router, Request, Response } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import { addClient, removeClient } from '../services/events.service';

const router = Router();

router.get('/stream', requireAuth, (req: Request, res: Response) => {
  const businessId = req.businessId;
  if (!businessId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  // Set necessary SSE headers
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // Avoid buffering on proxy servers
  res.setHeader('X-Accel-Buffering', 'no');

  // Send an initial event to establish connection
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED' })}\n\n`);

  addClient(businessId, res);

  req.on('close', () => {
    removeClient(businessId, res);
  });
});

export default router;