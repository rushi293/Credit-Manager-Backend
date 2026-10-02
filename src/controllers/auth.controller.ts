import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import prisma from '../utils/db';
import { broadcastEvent } from '../services/events.service';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-development-only';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  businessName: z.string().min(1, 'Business name is required')
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, businessName } = registerSchema.parse(req.body);

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'Email is already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: { name: businessName }
      });

      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          role: 'ADMIN',
          businessId: business.id
        }
      });

      return { user, business };
    });

    const session = await prisma.loginSession.create({
      data: {
        userId: result.user.id,
        businessId: result.business.id
      }
    });

    const token = jwt.sign(
      { userId: result.user.id, businessId: result.business.id, sessionId: session.id },
      JWT_SECRET,
      { expiresIn: '18h' }
    );

    res.status(201).json({
      success: true,
      data: {
        token,
        user: { id: result.user.id, email: result.user.email, role: result.user.role },
        business: result.business
      }
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ 
      where: { email },
      include: { business: true }
    });

    if (!user || !user.businessId) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const session = await prisma.loginSession.create({
      data: {
        userId: user.id,
        businessId: user.businessId
      }
    });

    const token = jwt.sign(
      { userId: user.id, businessId: user.businessId, sessionId: session.id },
      JWT_SECRET,
      { expiresIn: '18h' }
    );

    res.json({
      success: true,
      data: {
        token,
        user: { id: user.id, email: user.email, role: user.role },
        business: user.business
      }
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getMe = async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { business: true }
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({
      success: true,
      data: {
        user: { id: user.id, email: user.email, role: user.role },
        business: user.business
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};


const createStaffSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

export const createStaffUser = async (req: Request, res: Response) => {
  try {
    const adminUser = req.user;
    if (!adminUser || adminUser.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Only admins can create users' });
    }

    const { email, password } = createStaffSchema.parse(req.body);

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'Email already in use' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'STAFF',
        businessId: adminUser.businessId
      }
    });

    if (adminUser.businessId) broadcastEvent(adminUser.businessId, 'USER_CREATED', { userId: newUser.id });
    res.status(201).json({ success: true, message: 'Non-Admin user created successfully' });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    console.error('Create staff error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};


const updateCredentialsSchema = z.object({
  email: z.string().email(),
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters').optional().or(z.literal(''))
});

export const updateCredentials = async (req: Request, res: Response) => {
  try {
    const adminUser = req.user;
    if (!adminUser || adminUser.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Only admins can change credentials' });
    }

    const { email, currentPassword, newPassword } = updateCredentialsSchema.parse(req.body);

    const isMatch = await bcrypt.compare(currentPassword, adminUser.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ success: false, error: 'Incorrect current password' });
    }

    if (email !== adminUser.email) {
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
      where: { id: adminUser.id },
      data: dataToUpdate
    });

    if (adminUser.businessId) broadcastEvent(adminUser.businessId, 'USER_UPDATED', { userId: adminUser.id });
    res.json({ success: true, message: 'Credentials updated successfully' });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    console.error('Update credentials error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
