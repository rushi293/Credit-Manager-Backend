import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '../utils/db';
import { broadcastEvent } from '../services/events.service';

const requireAdmin = (req: Request, res: Response) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return false;
  }
  return true;
};

export const getLoginSessions = async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;

    const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000);
    const twentySixHoursAgo = new Date(Date.now() - 26 * 60 * 60 * 1000);

    const sessions = await prisma.loginSession.findMany({
      where: { 
        businessId: req.user!.businessId!,
        OR: [
          {
            revokedAt: null,
            loginAt: {
              gte: twentySixHoursAgo
            }
          },
          {
            revokedAt: {
              gte: eightHoursAgo
            }
          }
        ]
      },
      include: {
        user: {
          select: { email: true, role: true }
        }
      },
      orderBy: { loginAt: 'desc' }
    });

    res.json({ success: true, data: sessions });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const logoutSession = async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { id } = req.params;
    const session = await prisma.loginSession.findUnique({
      where: { id },
      include: { user: true }
    });

    if (!session || session.businessId !== req.user!.businessId) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    if (session.user.role === 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Cannot remotely logout an admin session' });
    }

    await prisma.loginSession.update({
      where: { id },
      data: {
        isValid: false,
        revokedAt: new Date()
      }
    });

    broadcastEvent(req.user!.businessId!, 'USER_LOGOUT', { sessionId: id });
    res.json({ success: true, message: 'Session revoked successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getNonAdmins = async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;

    const users = await prisma.user.findMany({
      where: {
        businessId: req.user!.businessId!,
        role: 'STAFF'
      },
      select: { id: true, email: true, role: true, createdAt: true }
    });

    res.json({ success: true, data: users });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const updateUserSchema = z.object({
  email: z.string().email(),
  newPassword: z.string().min(6, 'Password must be at least 6 characters').optional().or(z.literal(''))
});

export const updateNonAdmin = async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { id } = req.params;
    const { email, newPassword } = updateUserSchema.parse(req.body);

    const userToUpdate = await prisma.user.findUnique({ where: { id } });
    if (!userToUpdate || userToUpdate.businessId !== req.user!.businessId || userToUpdate.role !== 'STAFF') {
      return res.status(404).json({ success: false, error: 'User not found or not a non-admin' });
    }

    if (email !== userToUpdate.email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return res.status(400).json({ success: false, error: 'Email already in use' });
      }
    }

    const dataToUpdate: any = { email };
    if (newPassword && newPassword.length >= 6) {
      dataToUpdate.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    await prisma.user.update({
      where: { id },
      data: dataToUpdate
    });

    broadcastEvent(req.user!.businessId!, 'USER_UPDATED', { userId: id });
    res.json({ success: true, message: 'User updated successfully' });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

export const deleteNonAdmin = async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { id } = req.params;
    const userToDelete = await prisma.user.findUnique({ where: { id } });

    if (!userToDelete || userToDelete.businessId !== req.user!.businessId || userToDelete.role !== 'STAFF') {
      return res.status(404).json({ success: false, error: 'User not found or not a non-admin' });
    }

    await prisma.user.delete({
      where: { id }
    });

    broadcastEvent(req.user!.businessId!, 'USER_DELETED', { userId: id });
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};