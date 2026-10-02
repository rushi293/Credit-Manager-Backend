import { Request, Response } from 'express';
import prisma from '../utils/db';
import { broadcastEvent } from '../services/events.service';
import { processPaymentSafely } from '../services/payment.service';

export const getPayments = async (req: Request, res: Response) => {
  try {
    const businessId = req.businessId!;
    const { customerId, creditBillId } = req.query;

    const payments = await prisma.payment.findMany({
      where: { 
        businessId,
        ...(customerId ? { customerId: String(customerId) } : {}),
        ...(creditBillId ? { creditBillId: String(creditBillId) } : {})
      },
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { name: true } },
        creditBill: { select: { billNumber: true } }
      }
    });

    res.json({ success: true, data: payments });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const createPayment = async (req: Request, res: Response) => {
  try {
    const businessId = req.businessId!;
    const { customerId, creditBillId, amount, paymentMethod, paymentDate, notes } = req.body;

    const payment = await processPaymentSafely(
      businessId,
      customerId,
      creditBillId,
      Number(amount),
      paymentMethod,
      new Date(paymentDate),
      notes
    );

    broadcastEvent(req.businessId!, 'PAYMENT_CREATED', { paymentId: payment.id });
    broadcastEvent(req.businessId!, 'METRICS_UPDATED');
    res.status(201).json({ success: true, data: payment });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    // Handle our custom errors from processPaymentSafely
    if (error.message.includes('greater than zero') || error.message.includes('exceed') || error.message.includes('mismatch') || error.message.includes('not found')) {
       return res.status(400).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};
