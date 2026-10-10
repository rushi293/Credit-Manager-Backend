import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../utils/db';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-development-only';

// Short-lived in-memory cache for user lookups.
// The JWT signature is still verified cryptographically on every request.
// This cache only eliminates the "does user still exist?" DB round-trip.
// TTL: 60 seconds — a deleted account stops working within 1 minute.
interface CachedUser { user: any; expiresAt: number }
const userCache = new Map<string, CachedUser>();
const USER_CACHE_TTL_MS = 60_000; // 60 seconds

function getCachedUser(userId: string) {
  const cached = userCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.user;
  userCache.delete(userId);
  return null;
}
function setCachedUser(userId: string, user: any) {
  userCache.set(userId, { user, expiresAt: Date.now() + USER_CACHE_TTL_MS });
  // Prevent unbounded growth: evict entries when cache gets large
  if (userCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of userCache) {
      if (v.expiresAt <= now) userCache.delete(k);
    }
  }
}

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

    // Check cache first — avoids a DB round-trip for every warm request.
    // The JWT cryptographic verification above still runs every time.
    let user = getCachedUser(decoded.userId);
    if (!user) {
      user = await prisma.user.findUnique({ where: { id: decoded.userId } });
      if (!user) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Invalid user' });
      }
      setCachedUser(decoded.userId, user);
    }

    if (decoded.sessionId) {
      let sessionValid = true;
      const cachedSessionKey = `session_${decoded.sessionId}`;
      const cachedSession = getCachedUser(cachedSessionKey);
      
      if (!cachedSession) {
        const session = await prisma.loginSession.findUnique({
          where: { id: decoded.sessionId }
        });
        if (!session || !session.isValid || session.revokedAt) {
          sessionValid = false;
        } else {
          setCachedUser(cachedSessionKey, { valid: true });
        }
      }

      if (!sessionValid) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Session revoked' });
      }
      
      // Update lastActivityAt occasionally (e.g. random 10% chance to reduce DB writes)
      if (Math.random() < 0.1) {
        await prisma.loginSession.update({
          where: { id: decoded.sessionId },
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
