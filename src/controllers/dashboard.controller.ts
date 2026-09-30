import { Request, Response } from 'express';
import prisma from '../utils/db';
import { calculateCustomerBalance, calculateBillFinances, BillStatus } from '../services/finance.service';
import { Decimal } from '@prisma/client/runtime/library';

export const getDashboardData = async (req: Request, res: Response) => {
  try {
    const businessId = req.businessId!;

    // 1. Total Customers
    const totalCustomers = await prisma.customer.count({
      where: { businessId }
    });

    // 2. Fetch all bills and payments to calculate true outstanding
    // We could optimize this with SQL aggregations, but given the business logic rules 
    // strictly use Decimal calculations, fetching and applying logic ensures 100% parity.
    const allCustomers = await prisma.customer.findMany({
      where: { businessId },
      include: {
        bills: { select: { totalAmount: true, dueDate: true } },
        payments: { select: { amount: true } }
      }
    });

    let totalOutstandingCredit = new Decimal(0);
    
    allCustomers.forEach(customer => {
      const { outstandingBalance } = calculateCustomerBalance(customer.bills, customer.payments);
      totalOutstandingCredit = totalOutstandingCredit.plus(outstandingBalance);
    });

    // 3. Count bills by status
    const allBills = await prisma.creditBill.findMany({
      where: { businessId },
      include: { payments: { select: { amount: true } } }
    });

    let unpaidBillsCount = 0;
    let partiallyPaidBillsCount = 0;
    let overdueAmount = new Decimal(0);

    allBills.forEach(bill => {
      const { status, remainingAmount } = calculateBillFinances(bill.totalAmount, bill.payments, bill.dueDate);
      
      if (status === BillStatus.UNPAID) unpaidBillsCount++;
      if (status === BillStatus.PARTIALLY_PAID) partiallyPaidBillsCount++;
      if (status === BillStatus.OVERDUE) {
         overdueAmount = overdueAmount.plus(remainingAmount);
      }
    });

    const { date } = req.query;
    const dateFilter = date ? {
      billDate: {
        gte: new Date(new Date(String(date)).setHours(0, 0, 0, 0)),
        lte: new Date(new Date(String(date)).setHours(23, 59, 59, 999))
      }
    } : {};

    // 4. Recent Activity
    const recentBills = await prisma.creditBill.findMany({
      where: { 
        businessId, 
        isArchived: false,
        ...dateFilter
      },
      orderBy: { createdAt: 'desc' },
      take: 20, // increased take to show more bills for a specific day
      include: { 
        customer: { select: { name: true } },
        payments: { select: { amount: true } }
      }
    });

    const recentBillsWithFinances = recentBills.map(bill => {
      const { remainingAmount, status, totalPaid } = calculateBillFinances(
        bill.totalAmount,
        bill.payments,
        bill.dueDate
      );
      const { payments, ...billData } = bill;
      return { ...billData, totalPaid, remainingAmount, status };
    });

    const recentPayments = await prisma.payment.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { customer: { select: { name: true } } }
    });

    res.json({
      success: true,
      data: {
        metrics: {
          totalCustomers,
          totalOutstandingCredit,
          unpaidBillsCount,
          partiallyPaidBillsCount,
          overdueAmount
        },
        recentBills: recentBillsWithFinances,
        recentPayments
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
