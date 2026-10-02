import fs from 'fs';
const path = './src/controllers/dashboard.controller.ts';
let content = fs.readFileSync(path, 'utf8');

// Replace the sequential queries with Promise.all
content = content.replace(/\/\/ 1\. Total Customers[\s\S]*?(?=res\.json\(\{)/, `
    const { date } = req.query;
    const dateFilter = date ? {
      billDate: {
        gte: new Date(new Date(String(date)).setHours(0, 0, 0, 0)),
        lte: new Date(new Date(String(date)).setHours(23, 59, 59, 999))
      }
    } : {};

    const [
      totalCustomers,
      allBills,
      recentBills,
      recentPayments
    ] = await Promise.all([
      prisma.customer.count({ where: { businessId } }),
      prisma.creditBill.findMany({
        where: { businessId },
        select: { totalAmount: true, dueDate: true, payments: { select: { amount: true } } }
      }),
      prisma.creditBill.findMany({
        where: { businessId, isArchived: false, ...dateFilter },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { customer: { select: { name: true } }, payments: { select: { amount: true } } }
      }),
      prisma.payment.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { customer: { select: { name: true } } }
      })
    ]);

    let totalOutstandingCredit = new Decimal(0);
    let unpaidBillsCount = 0;
    let partiallyPaidBillsCount = 0;
    let overdueAmount = new Decimal(0);

    allBills.forEach(bill => {
      const { status, remainingAmount } = calculateBillFinances(bill.totalAmount, bill.payments as any, bill.dueDate);
      
      totalOutstandingCredit = totalOutstandingCredit.plus(remainingAmount);

      if (status === BillStatus.UNPAID) unpaidBillsCount++;
      if (status === BillStatus.PARTIALLY_PAID) partiallyPaidBillsCount++;
      if (status === BillStatus.OVERDUE) {
         overdueAmount = overdueAmount.plus(remainingAmount);
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

    `);

fs.writeFileSync(path, content, 'utf8');
console.log("Dashboard refactored!");
