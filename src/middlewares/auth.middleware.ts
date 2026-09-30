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

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; businessId: string };

    // Optionally verify user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
    });

    if (!user) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid user' });
    }

    req.userId = decoded.userId;
    req.user = user;
    req.businessId = decoded.businessId;
    
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Token expired or invalid' });
  }
};
