import { Request, Response } from 'express';
import prisma from '../utils/db';
import { calculateCustomerBalance, calculateBillFinances, BillStatus } from '../services/finance.service';
import { Decimal } from '@prisma/client/runtime/library';

export const getDashboardData = async (req: Request, res: Response) => {
  try {
    const businessId = req.businessId!;

    
    const { date } = req.query;
    const dateFilter = date ? {
      billDate: {
        gte: new Date(new Date(String(date)).setHours(0, 0, 0, 0)),
        lte: new Date(new Date(String(date)).setHours(23, 59, 59, 999))
      }
    } : {};

    // Run sequentially instead of Promise.all to prevent Neon Postgres connection pool exhaustion.
    // In serverless environments, Promise.all triggers massive connection storms that cause 4s+ delays.
    const totalCustomers = await prisma.customer.count({ where: { businessId } });
    
    const metricsRaw = await prisma.$queryRaw<any[]>`
      WITH BillStats AS (
        SELECT 
          b.id,
          b."totalAmount",
          b."dueDate",
          COALESCE(SUM(p.amount), 0) as "totalPaid"
        FROM "CreditBill" b
        LEFT JOIN "Payment" p ON p."creditBillId" = b.id
        WHERE b."businessId" = ${businessId}
        GROUP BY b.id, b."totalAmount", b."dueDate"
      )
      SELECT 
        COALESCE(SUM("totalAmount" - "totalPaid"), 0) as "totalOutstandingCredit",
        COUNT(CASE WHEN "totalPaid" = 0 AND "totalAmount" > 0 AND ("dueDate" IS NULL OR "dueDate" >= CURRENT_TIMESTAMP) THEN 1 END) as "unpaidBillsCount",
        COUNT(CASE WHEN "totalPaid" > 0 AND "totalPaid" < "totalAmount" AND ("dueDate" IS NULL OR "dueDate" >= CURRENT_TIMESTAMP) THEN 1 END) as "partiallyPaidBillsCount",
        SUM(CASE WHEN "totalAmount" > "totalPaid" AND "dueDate" < CURRENT_TIMESTAMP THEN "totalAmount" - "totalPaid" ELSE 0 END) as "overdueAmount"
      FROM BillStats
    `;

    const recentBills = await prisma.creditBill.findMany({
      where: { businessId, isArchived: false, ...dateFilter },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { customer: { select: { name: true } }, payments: { select: { amount: true } } }
    });

    const recentPayments = await prisma.payment.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { customer: { select: { name: true } } }
    });

    const totalOutstandingCredit = new Decimal(metricsRaw[0]?.totalOutstandingCredit || 0);
    const unpaidBillsCount = Number(metricsRaw[0]?.unpaidBillsCount || 0);
    const partiallyPaidBillsCount = Number(metricsRaw[0]?.partiallyPaidBillsCount || 0);
    const overdueAmount = new Decimal(metricsRaw[0]?.overdueAmount || 0);

    const recentBillsWithFinances = recentBills.map(bill => {
      const { remainingAmount, status, totalPaid } = calculateBillFinances(
        bill.totalAmount,
        bill.payments,
        bill.dueDate
      );
      const { payments, ...billData } = bill;
      return { ...billData, totalPaid, remainingAmount, status };
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
