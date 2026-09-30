import { Decimal } from '@prisma/client/runtime/library';

export enum BillStatus {
  PAID = 'PAID',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  UNPAID = 'UNPAID',
  OVERDUE = 'OVERDUE',
}

/**
 * Calculate the status and remaining amount for a bill.
 * Uses Decimal for precise financial calculations.
 * 
 * Due Date Rule: A bill becomes OVERDUE strictly after its due date timestamp 
 * has passed (currentDate > dueDate). This represents the end of the due date.
 */
export function calculateBillFinances(
  totalAmount: Decimal | number | string,
  payments: { amount: Decimal | number | string }[],
  dueDate?: Date | null,
  currentDate: Date = new Date()
) {
  const total = new Decimal(totalAmount);
  
  const totalPaid = payments.reduce(
    (sum, payment) => {
      const pAmt = new Decimal(payment.amount);
      if (pAmt.lte(0)) {
        throw new Error('Individual payment amounts must be strictly greater than zero.');
      }
      return sum.plus(pAmt);
    },
    new Decimal(0)
  );
  
  const remainingAmount = total.minus(totalPaid);
  
  if (remainingAmount.lt(0)) {
    throw new Error('Total payments cannot exceed the bill total amount.');
  }
  
  let status: BillStatus;

  if (remainingAmount.lte(0)) {
    status = BillStatus.PAID;
  } else if (totalPaid.gt(0)) {
    // Has some payment but remaining > 0
    if (dueDate && currentDate > dueDate) {
      status = BillStatus.OVERDUE;
    } else {
      status = BillStatus.PARTIALLY_PAID;
    }
  } else {
    // No payments made
    if (dueDate && currentDate > dueDate) {
      status = BillStatus.OVERDUE;
    } else {
      status = BillStatus.UNPAID;
    }
  }

  return {
    totalAmount: total,
    totalPaid,
    remainingAmount,
    status
  };
}

/**
 * Calculate total customer balance from bills and payments.
 */
export function calculateCustomerBalance(
  bills: { totalAmount: Decimal | number | string }[],
  payments: { amount: Decimal | number | string }[]
) {
  const totalCredit = bills.reduce(
    (sum, bill) => sum.plus(new Decimal(bill.totalAmount)),
    new Decimal(0)
  );

  const totalPaid = payments.reduce(
    (sum, payment) => sum.plus(new Decimal(payment.amount)),
    new Decimal(0)
  );

  const outstandingBalance = totalCredit.minus(totalPaid);

  return {
    totalCredit,
    totalPaid,
    outstandingBalance
  };
}
