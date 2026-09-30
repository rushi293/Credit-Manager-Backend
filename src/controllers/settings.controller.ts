import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/db';

const settingsSchema = z.object({
  name: z.string().min(1, 'Business name is required').optional(),
  defaultDuePeriod: z.number().min(0, 'Default due period must be 0 or greater').optional(),
});

export const updateSettings = async (req: Request, res: Response) => {
  try {
    const businessId = req.businessId!;
    const data = settingsSchema.parse(req.body);

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ success: false, error: 'No fields provided to update' });
    }

    const updatedBusiness = await prisma.business.update({
      where: { id: businessId },
      data
    });

    res.json({ success: true, data: updatedBusiness });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};
