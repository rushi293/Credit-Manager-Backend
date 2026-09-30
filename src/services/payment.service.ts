import { Prisma, PaymentMethod } from '@prisma/client';
import { calculateBillFinances } from './finance.service';
import prisma from '../utils/db';
import { createPaymentSchema } from '../schemas';

export async function processPaymentSafely(
  businessId: string,
  customerId: string,
  creditBillId: string,
  amount: number,
  paymentMethod: PaymentMethod,
  paymentDate: Date,
  notes?: string
) {
  // Validate incoming payment data against Zod schema
  const parsedData = createPaymentSchema.parse({
    businessId,
    customerId,
    creditBillId,
    amount,
    paymentDate: paymentDate.toISOString(),
    paymentMethod,
    notes,
  });

  if (parsedData.amount <= 0) {
    throw new Error('Payment amount must be greater than zero.');
  }

  // Use a transaction to prevent race conditions during concurrent payments
  return await prisma.$transaction(async (tx) => {
    // 1. Fetch the bill with an exclusive lock (FOR UPDATE) using a raw query.
    // This strictly prevents concurrent payment processes from reading the balance 
    // before the first transaction commits its payment.
    const lockedBills = await tx.$queryRawUnsafe<
      { id: string; businessId: string; customerId: string; totalAmount: any }[]
    >('SELECT id, "businessId", "customerId", "totalAmount" FROM "CreditBill" WHERE id = $1 FOR UPDATE', creditBillId);

    if (!lockedBills || lockedBills.length === 0) {
      throw new Error('Bill not found');
    }

    const lockedBill = lockedBills[0];

    // 2. Validate associations
    if (lockedBill.businessId !== businessId) {
      throw new Error('Business mismatch');
    }
    if (lockedBill.customerId !== customerId) {
      throw new Error('Customer mismatch');
    }

    // 3. Fetch existing payments for this bill safely inside the locked transaction
    const existingPayments = await tx.payment.findMany({
      where: { creditBillId },
      select: { amount: true },
    });

    // 4. Calculate if the new payment would exceed the balance.
    // calculateBillFinances throws if amount exceeds remaining balance.
    const simulatedPayments = [...existingPayments, { amount: parsedData.amount }];
    const finances = calculateBillFinances(lockedBill.totalAmount, simulatedPayments);

    // 5. Create the payment
    const payment = await tx.payment.create({
      data: {
        businessId: parsedData.businessId,
        customerId: parsedData.customerId,
        creditBillId: parsedData.creditBillId,
        amount: parsedData.amount,
        paymentMethod: parsedData.paymentMethod,
        paymentDate: new Date(parsedData.paymentDate),
        notes: parsedData.notes,
      }
    });

    // 6. Auto-archive the bill if fully paid
    if (finances.status === 'PAID') {
      await tx.creditBill.update({
        where: { id: parsedData.creditBillId },
        data: { isArchived: true }
      });
    }

    return payment;
  });
}
