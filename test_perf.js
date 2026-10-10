const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const user = await prisma.user.findFirst();
  const businessId = user.businessId;
  const start = Date.now();
  await prisma.customer.count({ where: { businessId } });
  await prisma.$queryRaw\
    WITH BillStats AS (
      SELECT 
        b.id,
        b."totalAmount",
        b."dueDate",
        COALESCE(SUM(p.amount), 0) as "totalPaid"
      FROM "CreditBill" b
      LEFT JOIN "Payment" p ON p."creditBillId" = b.id
      WHERE b."businessId" = \
      GROUP BY b.id, b."totalAmount", b."dueDate"
    )
    SELECT 
      COALESCE(SUM("totalAmount" - "totalPaid"), 0) as "totalOutstandingCredit"
    FROM BillStats
  \;
  await prisma.creditBill.findMany({ take: 20 });
  await prisma.payment.findMany({ take: 5 });
  console.log('Sequential time:', Date.now() - start + 'ms');
  process.exit(0);
}
run();
