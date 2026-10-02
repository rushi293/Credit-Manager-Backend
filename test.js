const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function test() {
  await prisma.$connect();
  const start = Date.now();
  const bills = await prisma.creditBill.findMany({
        where: { businessId: "11111111-1111-1111-1111-111111111111" },
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { name: true, phone: true } },
          payments: { select: { amount: true } }
        }
      });
  console.log(`getBills took ${Date.now() - start}ms`);
}
test().finally(() => prisma.$disconnect());
