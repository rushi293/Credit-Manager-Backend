import { processPaymentSafely } from '../services/payment.service';
import prisma from '../utils/db';
import { PaymentMethod } from '@prisma/client';

// Mock the prisma client
jest.mock('../utils/db', () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn((callback) => callback(prisma)),
    $queryRawUnsafe: jest.fn(),
    payment: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  },
}));

describe('Payment Service', () => {
  const mockDate = new Date('2025-01-01');
  
  // Zod requires valid UUIDs
  const BIZ_ID = '11111111-1111-1111-1111-111111111111';
  const CUST_ID = '22222222-2222-2222-2222-222222222222';
  const BILL_ID = '33333333-3333-3333-3333-333333333333';
  const OTHER_BIZ_ID = '44444444-4444-4444-4444-444444444444';
  const OTHER_CUST_ID = '55555555-5555-5555-5555-555555555555';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should throw an error if payment amount is zero or negative', async () => {
    // Both of these fail validation in Zod before hitting DB logic
    await expect(
      processPaymentSafely(BIZ_ID, CUST_ID, BILL_ID, 0, PaymentMethod.CASH, mockDate)
    ).rejects.toThrow(); // Zod error "Number must be greater than 0"
    
    await expect(
      processPaymentSafely(BIZ_ID, CUST_ID, BILL_ID, -50, PaymentMethod.CASH, mockDate)
    ).rejects.toThrow(); // Zod error "Number must be greater than 0"
  });

  it('should throw if bill is not found (row lock fails)', async () => {
    (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValueOnce([]); // No row returned

    await expect(
      processPaymentSafely(BIZ_ID, CUST_ID, BILL_ID, 100, PaymentMethod.CASH, mockDate)
    ).rejects.toThrow('Bill not found');
  });

  it('should throw if business mismatch', async () => {
    (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValueOnce([
      { id: BILL_ID, businessId: OTHER_BIZ_ID, customerId: CUST_ID, totalAmount: 1000 }
    ]);

    await expect(
      processPaymentSafely(BIZ_ID, CUST_ID, BILL_ID, 100, PaymentMethod.CASH, mockDate)
    ).rejects.toThrow('Business mismatch');
  });

  it('should throw if customer mismatch', async () => {
    (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValueOnce([
      { id: BILL_ID, businessId: BIZ_ID, customerId: OTHER_CUST_ID, totalAmount: 1000 }
    ]);

    await expect(
      processPaymentSafely(BIZ_ID, CUST_ID, BILL_ID, 100, PaymentMethod.CASH, mockDate)
    ).rejects.toThrow('Customer mismatch');
  });

  it('should successfully create payment when valid', async () => {
    (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValueOnce([
      { id: BILL_ID, businessId: BIZ_ID, customerId: CUST_ID, totalAmount: 1000 }
    ]);
    (prisma.payment.findMany as jest.Mock).mockResolvedValueOnce([{ amount: 500 }]);
    (prisma.payment.create as jest.Mock).mockResolvedValueOnce({ id: 'pay-1', amount: 100 });

    const result = await processPaymentSafely(BIZ_ID, CUST_ID, BILL_ID, 100, PaymentMethod.CASH, mockDate);
    
    expect(prisma.payment.create).toHaveBeenCalled();
    expect(result.id).toBe('pay-1');
  });

  it('should prevent concurrent overpayment by relying on totalAmount lock and finance calculation', async () => {
    (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValueOnce([
      { id: BILL_ID, businessId: BIZ_ID, customerId: CUST_ID, totalAmount: 1000 }
    ]);
    // Simulate another payment already existing that leaves exactly 50 remaining, 
    // but the incoming payment is 100.
    (prisma.payment.findMany as jest.Mock).mockResolvedValueOnce([{ amount: 950 }]);

    await expect(
      processPaymentSafely(BIZ_ID, CUST_ID, BILL_ID, 100, PaymentMethod.CASH, mockDate)
    ).rejects.toThrow('Total payments cannot exceed the bill total amount.');
  });
});
