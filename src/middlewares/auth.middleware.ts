import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../utils/db';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-development-only';

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let token = '';
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query.token && typeof req.query.token === 'string') {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Missing or invalid token' });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; businessId: string; sessionId?: string };

    // Optionally verify user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
    });

    if (!user) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid user' });
    }

    if (decoded.sessionId) {
      const session = await prisma.loginSession.findUnique({
        where: { id: decoded.sessionId }
      });
      if (!session || !session.isValid || session.revokedAt) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Session revoked' });
      }
      
      // Update lastActivityAt occasionally (e.g. random 10% chance to reduce DB writes)
      if (Math.random() < 0.1) {
        await prisma.loginSession.update({
          where: { id: session.id },
          data: { lastActivityAt: new Date() }
        }).catch(() => {});
      }
      
      req.sessionId = decoded.sessionId;
    }

    req.userId = decoded.userId;
    req.user = user;
    req.businessId = decoded.businessId;
    
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Token expired or invalid' });
  }
};
