import { Decimal } from '@prisma/client/runtime/library';
import { calculateBillFinances, calculateCustomerBalance, BillStatus } from '../services/finance.service';

describe('Finance Service Logic', () => {
  describe('calculateBillFinances', () => {
    it('should correctly mark a bill as UNPAID', () => {
      const result = calculateBillFinances(1000, [], new Date('2099-01-01'));
      expect(result.status).toBe(BillStatus.UNPAID);
      expect(result.remainingAmount.toString()).toBe('1000');
    });

    it('should correctly mark a bill as PARTIALLY_PAID', () => {
      const result = calculateBillFinances(1000, [{ amount: 400 }], new Date('2099-01-01'));
      expect(result.status).toBe(BillStatus.PARTIALLY_PAID);
      expect(result.remainingAmount.toString()).toBe('600');
    });

    it('should correctly mark a bill as PAID', () => {
      const result = calculateBillFinances(1000, [{ amount: 1000 }], new Date('2099-01-01'));
      expect(result.status).toBe(BillStatus.PAID);
      expect(result.remainingAmount.toString()).toBe('0');
    });

    it('should correctly mark a bill as OVERDUE if unpaid and past due', () => {
      const pastDate = new Date('2020-01-01');
      const result = calculateBillFinances(1000, [], pastDate);
      expect(result.status).toBe(BillStatus.OVERDUE);
    });

    it('should correctly mark a bill as OVERDUE if partially paid and past due', () => {
      const pastDate = new Date('2020-01-01');
      const result = calculateBillFinances(1000, [{ amount: 200 }], pastDate);
      expect(result.status).toBe(BillStatus.OVERDUE);
      expect(result.remainingAmount.toString()).toBe('800');
    });
    
    it('should NOT mark a bill as OVERDUE if fully paid, even if past due', () => {
      const pastDate = new Date('2020-01-01');
      const result = calculateBillFinances(1000, [{ amount: 1000 }], pastDate);
      expect(result.status).toBe(BillStatus.PAID);
      expect(result.remainingAmount.toString()).toBe('0');
    });

    it('should throw an error if payments exceed the total bill amount', () => {
      expect(() => {
        calculateBillFinances(1000, [{ amount: 1500 }]);
      }).toThrow('Total payments cannot exceed the bill total amount.');
    });

    it('should throw an error if a payment is zero or negative', () => {
      expect(() => {
        calculateBillFinances(1000, [{ amount: 0 }]);
      }).toThrow('Individual payment amounts must be strictly greater than zero.');
      
      expect(() => {
        calculateBillFinances(1000, [{ amount: -100 }]);
      }).toThrow('Individual payment amounts must be strictly greater than zero.');
    });

    it('should correctly handle multiple payments exactly equaling the total', () => {
      const result = calculateBillFinances(1000, [{ amount: 400 }, { amount: 600 }]);
      expect(result.status).toBe(BillStatus.PAID);
      expect(result.remainingAmount.toString()).toBe('0');
    });

    it('should handle due date boundary correctly (not overdue if exact same time)', () => {
      const exactTime = new Date('2025-01-01T12:00:00Z');
      const result = calculateBillFinances(1000, [], exactTime, exactTime);
      expect(result.status).toBe(BillStatus.UNPAID);
    });
  });

  describe('calculateCustomerBalance', () => {
    it('should calculate the correct outstanding balance across multiple bills and payments', () => {
      const bills = [{ totalAmount: 1000 }, { totalAmount: 500.5 }];
      const payments = [{ amount: 200 }, { amount: 300.5 }];

      const result = calculateCustomerBalance(bills, payments);

      expect(result.totalCredit.toString()).toBe('1500.5');
      expect(result.totalPaid.toString()).toBe('500.5');
      expect(result.outstandingBalance.toString()).toBe('1000');
    });

    it('should return zero balances for a customer with no bills and no payments', () => {
      const result = calculateCustomerBalance([], []);
      expect(result.totalCredit.toString()).toBe('0');
      expect(result.totalPaid.toString()).toBe('0');
      expect(result.outstandingBalance.toString()).toBe('0');
    });
  });
});
