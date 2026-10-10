import { Request, Response } from 'express';
import prisma from '../utils/db';
import { calculateCustomerBalance, calculateBillFinances, BillStatus } from '../services/finance.service';
import { Decimal } from '@prisma/client/runtime/library';

import { getCache, setCache } from '../utils/cache';

export const getDashboardData = async (req: Request, res: Response) => {
  try {
    const businessId = req.businessId!;
    const { date } = req.query;
    const cacheKey = `${businessId}:dashboard:${date || 'all'}`;

    const cached = getCache(cacheKey);
    if (cached) {
      return res.json({ success: true, data: cached });
    }

    const dateFilter = date ? {
      billDate: {
        gte: new Date(new Date(String(date)).setHours(0, 0, 0, 0)),
        lte: new Date(new Date(String(date)).setHours(23, 59, 59, 999))
      }
    } : {};

    const t0 = Date.now();
    const [
      totalCustomers,
      metricsRaw,
      recentBills,
      recentPayments
    ] = await Promise.all([
      prisma.customer.count({ where: { businessId } }).then(res => { console.log('customer count:', Date.now() - t0); return res; }),
      prisma.$queryRaw<any[]>`
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
      `.then(res => { console.log('metrics raw:', Date.now() - t0); return res; }),
      prisma.creditBill.findMany({
        where: { businessId, isArchived: false, ...dateFilter },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { customer: { select: { name: true } }, payments: { select: { amount: true } } }
      }).then(res => { console.log('recent bills:', Date.now() - t0); return res; }),
      prisma.payment.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { customer: { select: { name: true } } }
      }).then(res => { console.log('recent payments:', Date.now() - t0); return res; })
    ]);
    console.log('Total Prisma Promise.all:', Date.now() - t0);

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

    const responseData = {
      metrics: {
        totalCustomers,
        totalOutstandingCredit,
        unpaidBillsCount,
        partiallyPaidBillsCount,
        overdueAmount
      },
      recentBills: recentBillsWithFinances,
      recentPayments
    };

    setCache(cacheKey, responseData, 60000); // 1-minute TTL or until invalidated

    res.json({
      success: true,
      data: responseData
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
