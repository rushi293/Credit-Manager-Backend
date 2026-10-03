import { Request, Response } from 'express';
import prisma from '../utils/db';
import { broadcastEvent } from '../services/events.service';
import { createCreditBillSchema, updateCreditBillSchema } from '../schemas';
import { calculateBillFinances } from '../services/finance.service';

export const getBills = async (req: Request, res: Response) => {
  try {
    const businessId = req.businessId!;
    const { customerId, archived, date, status } = req.query;

    let isArchivedCondition: boolean | undefined;
    if (archived === 'true') {
      isArchivedCondition = true;
    } else {
      isArchivedCondition = (status === 'PAID') ? undefined : false;
    }

    const bills = await prisma.creditBill.findMany({
      where: { 
        businessId,
        ...(customerId ? { customerId: String(customerId) } : {}),
        ...(isArchivedCondition !== undefined ? { isArchived: isArchivedCondition } : {}),
        ...(date ? {
          billDate: {
            gte: new Date(new Date(String(date)).setHours(0, 0, 0, 0)),
            lte: new Date(new Date(String(date)).setHours(23, 59, 59, 999))
          }
        } : {})
      },
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { name: true } },
        payments: { select: { amount: true, paymentDate: true, paymentMethod: true } }
      }
    });

    // Calculate finances for each bill
    let billsWithFinances = bills.map(bill => {
      const { remainingAmount, status: calcStatus, totalPaid } = calculateBillFinances(
        bill.totalAmount,
        bill.payments,
        bill.dueDate
      );
      
      return {
        ...bill,
        totalPaid,
        remainingAmount,
        status: calcStatus
      };
    });

    if (status && status !== 'ALL') {
      billsWithFinances = billsWithFinances.filter(b => b.status === String(status));
    }

    res.json({ success: true, data: billsWithFinances });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const createBill = async (req: Request, res: Response) => {
  try {
    const businessId = req.businessId!;
    const parsedData = createCreditBillSchema.parse({ ...req.body, businessId });

    if (!parsedData.dueDate) {
      parsedData.dueDate = parsedData.billDate;
    }

    // Validate customer belongs to business
    const customer = await prisma.customer.findFirst({
      where: { id: parsedData.customerId, businessId }
    });

    if (!customer) {
      return res.status(400).json({ success: false, error: 'Invalid customer' });
    }

    const bill = await prisma.creditBill.create({
      data: parsedData,
    });

    broadcastEvent(req.businessId!, 'CREDIT_BILL_CREATED', { billId: bill.id });
    broadcastEvent(req.businessId!, 'METRICS_UPDATED');
    res.status(201).json({ success: true, data: bill });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    // Handle unique constraint error for billNumber
    if (error.code === 'P2002') {
      return res.status(400).json({ success: false, error: 'Bill number must be unique for this business' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getBillById = async (req: Request, res: Response) => {
  try {
    const businessId = req.businessId!;
    const { id } = req.params;

    const bill = await prisma.creditBill.findFirst({
      where: { id, businessId },
      include: {
        customer: { select: { name: true, phone: true } },
        payments: { orderBy: { createdAt: 'desc' } },
        attachments: { orderBy: { createdAt: 'desc' } }
      }
    });

    if (!bill) {
      return res.status(404).json({ success: false, error: 'Bill not found' });
    }

    const { remainingAmount, status, totalPaid } = calculateBillFinances(
      bill.totalAmount,
      bill.payments,
      bill.dueDate
    );

    res.json({ 
      success: true, 
      data: {
        ...bill,
        totalPaid,
        remainingAmount,
        status
      } 
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};


export const updateBill = async (req: Request, res: Response) => {
  try {
    const businessId = req.businessId!;
    const { id } = req.params;
    const parsedData = updateCreditBillSchema.parse(req.body);

    if (!parsedData.dueDate) {
      parsedData.dueDate = parsedData.billDate;
    }

    // Verify bill exists
    const bill = await prisma.creditBill.findFirst({
      where: { id, businessId },
      include: { payments: true }
    });

    if (!bill) {
      return res.status(404).json({ success: false, error: 'Bill not found' });
    }

    // Check payment safety
    const { totalPaid } = calculateBillFinances(bill.totalAmount, bill.payments, bill.dueDate);
    
    if (parsedData.totalAmount < Number(totalPaid)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Bill amount cannot be less than the total amount already paid.' 
      });
    }

    // Verify customer exists and belongs to business
    const customer = await prisma.customer.findFirst({
      where: { id: parsedData.customerId, businessId }
    });

    if (!customer) {
      return res.status(400).json({ success: false, error: 'Invalid customer' });
    }

    // Perform update
    const updatedBill = await prisma.$transaction(async (tx) => {
      let isArchived = bill.isArchived;

      // If bill is unarchived because amount > paid
      if (isArchived && parsedData.totalAmount > Number(totalPaid)) {
        isArchived = false;
      } else if (!isArchived && parsedData.totalAmount === Number(totalPaid)) {
        isArchived = true;
      }

      const updated = await tx.creditBill.update({
        where: { id },
        data: {
          ...parsedData,
          isArchived
        }
      });

      // Optionally record audit
      await tx.auditLog.create({
        data: {
          businessId,
          action: 'UPDATE',
          entity: 'CreditBill',
          entityId: id,
          details: JSON.stringify({ previousAmount: bill.totalAmount, newAmount: parsedData.totalAmount })
        }
      });

      return updated;
    });

    const finances = calculateBillFinances(updatedBill.totalAmount, bill.payments, updatedBill.dueDate);

    broadcastEvent(req.businessId!, 'CREDIT_BILL_UPDATED', { billId: id });
    broadcastEvent(req.businessId!, 'METRICS_UPDATED');

    res.json({ 
      success: true, 
      data: {
        ...updatedBill,
        totalPaid: finances.totalPaid,
        remainingAmount: finances.remainingAmount,
        status: finances.status
      } 
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    console.error('Update bill error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const archiveBill = async (req: Request, res: Response) => {
  try {
    const businessId = req.businessId!;
    const { id } = req.params;

    const bill = await prisma.creditBill.findFirst({
      where: { id, businessId },
      include: { payments: true }
    });

    if (!bill) {
      return res.status(404).json({ success: false, error: 'Bill not found' });
    }

    const { status } = calculateBillFinances(bill.totalAmount, bill.payments, bill.dueDate);
    if (status !== 'PAID') {
      return res.status(400).json({ success: false, error: 'Only fully paid bills can be archived' });
    }

    const updated = await prisma.creditBill.update({
      where: { id },
      data: { isArchived: true }
    });

    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

import cloudinary from '../utils/cloudinary';

export const deleteBill = async (req: Request, res: Response) => {
  try {
    const businessId = req.businessId!;
    const { id } = req.params;

    const bill = await prisma.creditBill.findFirst({
      where: { id, businessId },
      include: { 
        payments: true,
        attachments: true
      }
    });

    if (!bill) {
      return res.status(404).json({ success: false, error: 'Bill not found' });
    }


    // Delete attached files from Cloudinary
    for (const attachment of bill.attachments) {
      const url = attachment.fileUrl;
      if (url.startsWith('http')) {
        try {
          const parts = url.split('/');
          const fileWithExt = parts[parts.length - 1];
          const folder = parts[parts.length - 2];
          const rootFolder = parts[parts.length - 3];
          const fileName = fileWithExt.split('.')[0];
          const publicId = `${rootFolder}/${folder}/${fileName}`;
          await cloudinary.uploader.destroy(publicId);
        } catch (e) { 
          console.error('Failed to delete file from Cloudinary', e); 
        }
      }
    }

    // Since payment relation is Restrict, we must manually delete payments first.
    // BillAttachment is Cascade, so it deletes automatically with the bill.
    await prisma.$transaction(async (tx) => {
      await tx.payment.deleteMany({
        where: { creditBillId: id }
      });
      await tx.creditBill.delete({
        where: { id }
      });
    });

    broadcastEvent(req.businessId!, 'CREDIT_BILL_DELETED', { billId: id });
    broadcastEvent(req.businessId!, 'METRICS_UPDATED');
    res.json({ success: true, message: 'Bill deleted successfully' });
  } catch (error: any) {
    console.error('Delete bill error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
