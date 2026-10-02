const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const c = await prisma.customer.count();
  const b = await prisma.creditBill.count();
  const p = await prisma.payment.count();
  console.log(`Customers: ${c}, Bills: ${b}, Payments: ${p}`);
}
test().finally(() => prisma.$disconnect());
