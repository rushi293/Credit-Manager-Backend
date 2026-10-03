import { Request, Response } from 'express';
import prisma from '../utils/db';
import { broadcastEvent } from '../services/events.service';
import { createDailyBillSchema, updateDailyBillSchema } from '../schemas';

export const getDailyBills = async (req: Request, res: Response) => {
  try {
    const businessId = req.businessId!;
    const { date, status, paymentMethod } = req.query;

    const dateFilter = date ? {
      billDate: {
        gte: new Date(new Date(String(date)).setHours(0, 0, 0, 0)),
        lte: new Date(new Date(String(date)).setHours(23, 59, 59, 999))
      }
    } : {};

    const bills = await prisma.dailyBill.findMany({
      where: {
        businessId,
        ...dateFilter,
        ...(status ? { status: String(status) } : {}),
        ...(paymentMethod && paymentMethod !== 'All' ? { paymentMethod: String(paymentMethod) } : {})
      },
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { name: true } }
      }
    });

    res.json({ success: true, data: bills });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const createDailyBill = async (req: Request, res: Response) => {
  try {
    const businessId = req.businessId!;
    const parsedData = createDailyBillSchema.parse(req.body);

    const customer = await prisma.customer.findFirst({
      where: { id: parsedData.customerId, businessId }
    });

    if (!customer) {
      return res.status(400).json({ success: false, error: 'Invalid customer' });
    }

    if (parsedData.status === 'UNPAID') {
      parsedData.paymentMethod = null;
    } else if (parsedData.status === 'PAID' && !parsedData.paymentMethod) {
      return res.status(400).json({ success: false, error: 'Payment method is required for paid bills' });
    }

    const bill = await prisma.dailyBill.create({
      data: {
        businessId,
        customerId: parsedData.customerId,
        billNumber: parsedData.billNumber,
        billAmount: parsedData.billAmount,
        status: parsedData.status,
        paymentMethod: parsedData.paymentMethod,
        billDate: new Date(parsedData.billDate)
      }
    });

    broadcastEvent(businessId, 'DAILY_BILL_CREATED', { billId: bill.id });
    broadcastEvent(businessId, 'METRICS_UPDATED');
    res.status(201).json({ success: true, data: bill });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateDailyBill = async (req: Request, res: Response) => {
  try {
    const businessId = req.businessId!;
    const { id } = req.params;
    const parsedData = updateDailyBillSchema.parse(req.body);

    const existingBill = await prisma.dailyBill.findFirst({
      where: { id, businessId }
    });

    if (!existingBill) {
      return res.status(404).json({ success: false, error: 'Daily bill not found' });
    }

    if (parsedData.customerId) {
      const customer = await prisma.customer.findFirst({
        where: { id: parsedData.customerId, businessId }
      });
      if (!customer) {
        return res.status(400).json({ success: false, error: 'Invalid customer' });
      }
    }

    if (parsedData.status === 'UNPAID') {
      parsedData.paymentMethod = null;
    } else if (parsedData.status === 'PAID' && !parsedData.paymentMethod && existingBill.status === 'UNPAID') {
      return res.status(400).json({ success: false, error: 'Payment method is required for paid bills' });
    }

    const updated = await prisma.dailyBill.update({
      where: { id },
      data: {
        ...parsedData,
        ...(parsedData.billDate ? { billDate: new Date(parsedData.billDate) } : {})
      }
    });

    broadcastEvent(businessId, 'DAILY_BILL_UPDATED', { billId: updated.id });
    broadcastEvent(businessId, 'METRICS_UPDATED');
    res.json({ success: true, data: updated });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

export const deleteDailyBill = async (req: Request, res: Response) => {
  try {
    const businessId = req.businessId!;
    const { id } = req.params;

    const existingBill = await prisma.dailyBill.findFirst({
      where: { id, businessId }
    });

    if (!existingBill) {
      return res.status(404).json({ success: false, error: 'Daily bill not found' });
    }

    await prisma.dailyBill.delete({
      where: { id }
    });

    broadcastEvent(businessId, 'DAILY_BILL_DELETED', { billId: id });
    broadcastEvent(businessId, 'METRICS_UPDATED');
    res.json({ success: true, message: 'Daily bill deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
