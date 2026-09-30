import { Request, Response } from 'express';
import prisma from '../utils/db';

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

    const metrics = await prisma.dailyMetric.findMany({
      where: query,
      orderBy: { date: 'asc' }
    });

    res.json({ success: true, data: metrics });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const upsertMetric = async (req: Request, res: Response) => {
  try {
    const businessId = req.businessId!;
    const { date, totalSales, totalExpense, totalIphoneSales } = req.body;

    const parsedDate = new Date(date);
    
    // Find if it exists
    let metric = await prisma.dailyMetric.findFirst({
      where: { businessId, date: parsedDate }
    });

    if (metric) {
      metric = await prisma.dailyMetric.update({
        where: { id: metric.id },
        data: {
          totalSales: totalSales ?? metric.totalSales,
          totalExpense: totalExpense ?? metric.totalExpense,
          totalIphoneSales: totalIphoneSales ?? metric.totalIphoneSales
        }
      });
    } else {
      metric = await prisma.dailyMetric.create({
        data: {
          businessId,
          date: parsedDate,
          totalSales: totalSales ?? 0,
          totalExpense: totalExpense ?? 0,
          totalIphoneSales: totalIphoneSales ?? 0
        }
      });
    }

    res.json({ success: true, data: metric });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
