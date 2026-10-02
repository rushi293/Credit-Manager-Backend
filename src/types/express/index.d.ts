import { Business } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      businessId?: string;
      sessionId?: string;
      userId?: string;
      user?: import('@prisma/client').User;
      business?: Business;
    }
  }
}
