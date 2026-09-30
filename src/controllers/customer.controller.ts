import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import prisma from '../utils/db';
import { createCustomerSchema } from '../schemas';
import { calculateCustomerBalance } from '../services/finance.service';
import cloudinary from '../utils/cloudinary';

export const getCustomers = async (req: Request, res: Response) => {
  try {
    const businessId = req.businessId!;
    const customers = await prisma.customer.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      include: {
        bills: { select: { totalAmount: true } },
        payments: { select: { amount: true } }
      }
    });

    // Calculate balances for each customer
    const customersWithBalances = customers.map(customer => {
      const { outstandingBalance, totalCredit, totalPaid } = calculateCustomerBalance(
        customer.bills,
        customer.payments
      );
      
      const { bills, payments, ...customerData } = customer;
      
      return {
        ...customerData,
        totalCredit,
        totalPaid,
        outstandingBalance
      };
    });

    res.json({ success: true, data: customersWithBalances });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const createCustomer = async (req: Request, res: Response) => {
  try {
    const businessId = req.businessId!;
    const parsedData = createCustomerSchema.parse({ ...req.body, businessId });

    const customer = await prisma.customer.create({
      data: parsedData,
    });

    res.status(201).json({ success: true, data: customer });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getCustomerById = async (req: Request, res: Response) => {
  try {
    const businessId = req.businessId!;
    const { id } = req.params;

    const customer = await prisma.customer.findFirst({
      where: { id, businessId },
      include: {
        bills: {
          orderBy: { createdAt: 'desc' },
          include: { payments: { select: { amount: true } } }
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          include: { creditBill: { select: { billNumber: true } } }
        }
      }
    });

    if (!customer) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    const { outstandingBalance, totalCredit, totalPaid } = calculateCustomerBalance(
      customer.bills,
      customer.payments
    );

    res.json({ 
      success: true, 
      data: {
        ...customer,
        totalCredit,
        totalPaid,
        outstandingBalance
      } 
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateCustomer = async (req: Request, res: Response) => {
  try {
    const businessId = req.businessId!;
    const { id } = req.params;
    
    // Using partial schema for updates, ignoring businessId
    const { name, phone, alternatePhone, address, notes } = req.body;

    const customer = await prisma.customer.findFirst({
      where: { id, businessId }
    });

    if (!customer) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    const updatedCustomer = await prisma.customer.update({
      where: { id },
      data: { name, phone, alternatePhone, address, notes }
    });

    res.json({ success: true, data: updatedCustomer });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const UPLOADS_DIR = path.join(__dirname, '../../uploads');

export const deleteCustomer = async (req: Request, res: Response) => {
  try {
    const businessId = req.businessId!;
    const { id } = req.params;

    // ── 1. Verify customer exists and belongs to this business (IDOR protection) ──
    const customer = await prisma.customer.findFirst({
      where: { id, businessId },
      include: {
        bills: {
          include: {
            attachments: { select: { id: true, fileUrl: true } }
          }
        },
        payments: {
          select: { amount: true }
        }
      }
    });

    if (!customer) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    // ── 1b. Verify Outstanding Balance ──
    const { outstandingBalance } = calculateCustomerBalance(customer.bills, customer.payments);
    if (outstandingBalance.gt(0)) {
      return res.status(400).json({
        success: false,
        error: 'CUSTOMER_HAS_BALANCE',
        remainingAmount: outstandingBalance.toNumber()
      });
    }

    // ── 2. Collect attachment file paths BEFORE the transaction ──────────────
    const filesToDelete: string[] = [];
    for (const bill of customer.bills) {
      for (const attachment of bill.attachments) {
        filesToDelete.push(attachment.fileUrl);
      }
    }

    const billIds = customer.bills.map(b => b.id);

    // ── 3. Delete files from Cloudinary ────
    for (const url of filesToDelete) {
      try {
        if (url.startsWith('http')) {
          const parts = url.split('/');
          const fileWithExt = parts[parts.length - 1];
          const folder = parts[parts.length - 2];
          const rootFolder = parts[parts.length - 3];
          const fileName = fileWithExt.split('.')[0];
          const publicId = `${rootFolder}/${folder}/${fileName}`;
          await cloudinary.uploader.destroy(publicId);
        }
      } catch (fileErr) {
        // Log but do not abort — the DB record cleanup must still complete
        console.error('Warning: could not delete attachment from Cloudinary:', url, fileErr);
      }
    }

    // ── 4. Atomic transaction: delete all customer data in FK-safe order ─────
    await prisma.$transaction(async (tx) => {
      // a. BillAttachments (Cascade from bill, but explicit is safer)
      if (billIds.length > 0) {
        await tx.billAttachment.deleteMany({
          where: { creditBillId: { in: billIds } }
        });
      }

      // b. Payments scoped to this customer (covers all bills incl. archived)
      await tx.payment.deleteMany({
        where: { customerId: id }
      });

      // c. CreditBills for this customer
      await tx.creditBill.deleteMany({
        where: { customerId: id }
      });

      // d. Finally delete the customer itself
      await tx.customer.delete({
        where: { id }
      });
    });

    res.json({ success: true, message: 'Customer and all associated records deleted successfully.' });
  } catch (error: any) {
    console.error('Delete customer error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Unable to delete this customer. Please try again.'
    });
  }
};

