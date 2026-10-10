import { Request, Response } from 'express';
import prisma from '../utils/db';
import { broadcastEvent } from '../services/events.service';

export const getMetricsByDateRange = async (req: Request, res: Response) => {
  try {
    const businessId = req.businessId!;
    const { startDate, endDate } = req.query;

    const query: any = { businessId };
    
    if (startDate && endDate) {
      query.date = {
        gte: new Date(String(startDate)),
        lte: new Date(String(endDate))
      };
    } else if (startDate) {
      query.date = new Date(String(startDate));
    }

    const [metrics, dailyBills] = await Promise.all([
      prisma.dailyMetric.findMany({
        where: query,
        orderBy: { date: 'asc' }
      }),
      prisma.dailyBill.groupBy({
        by: ['billDate'],
        where: {
          businessId,
          ...(query.date ? { billDate: query.date } : {})
        },
        _sum: { billAmount: true }
      })
    ]);

    const dailyBillsMap = new Map();
    dailyBills.forEach(db => {
      const dStr = db.billDate.toISOString().split('T')[0];
      dailyBillsMap.set(dStr, Number(db._sum.billAmount || 0));
    });

    const enhancedMetrics = metrics.map(m => {
      const dStr = m.date.toISOString().split('T')[0];
      const dailyBillsSum = dailyBillsMap.get(dStr);
      return {
        ...m,
        totalSales: dailyBillsSum !== undefined ? dailyBillsSum : m.totalSales
      };
    });

    // Also inject synthetic metrics for dates that have DailyBills but no DailyMetric
    dailyBills.forEach(db => {
      const dStr = db.billDate.toISOString().split('T')[0];
      if (!enhancedMetrics.find(m => m.date.toISOString().split('T')[0] === dStr)) {
        enhancedMetrics.push({
          id: 'synthetic-' + dStr,
          businessId,
          date: db.billDate,
          totalSales: Number(db._sum.billAmount || 0),
          totalExpense: 0,
          totalIphoneSales: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        } as any);
      }
    });

    enhancedMetrics.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    res.json({ success: true, data: enhancedMetrics });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const upsertMetric = async (req: Request, res: Response) => {
  try {
    const businessId = req.businessId!;
    // Note: totalSales is extracted but intentionally ignored for saving, because it's computed dynamically from DailyBills
    const { date, totalExpense, totalIphoneSales } = req.body;

    const parsedDate = new Date(date);
    
    let metric = await prisma.dailyMetric.findFirst({
      where: { businessId, date: parsedDate }
    });

    if (metric) {
      metric = await prisma.dailyMetric.update({
        where: { id: metric.id },
        data: {
          totalExpense: totalExpense ?? metric.totalExpense,
          totalIphoneSales: totalIphoneSales ?? metric.totalIphoneSales
        }
      });
    } else {
      metric = await prisma.dailyMetric.create({
        data: {
          businessId,
          date: parsedDate,
          totalExpense: totalExpense ?? 0,
          totalIphoneSales: totalIphoneSales ?? 0
        }
      });
    }

    broadcastEvent(req.businessId!, 'METRICS_UPDATED');
    res.json({ success: true, data: metric });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
