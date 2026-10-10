import { z } from 'zod';

// Customer schemas
export const createCustomerSchema = z.object({
  businessId: z.string().uuid(),
  name: z.string().min(1),
  phone: z.string().optional(),
  alternatePhone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

// Bill schemas
export const createCreditBillSchema = z.object({
  businessId: z.string().uuid(),
  customerId: z.string().uuid(),
  billNumber: z.string().min(1),
  billDate: z.string().datetime(),
  dueDate: z.string().datetime().optional(),
  totalAmount: z.number().positive(),
  notes: z.string().optional(),
});

export const updateCreditBillSchema = z.object({
  customerId: z.string().uuid(),
  billDate: z.string().datetime(),
  dueDate: z.string().datetime().optional(),
  totalAmount: z.number().positive(),
  notes: z.string().optional(),
});

// Payment schemas
export const createPaymentSchema = z.object({
  businessId: z.string().uuid(),
  customerId: z.string().uuid(),
  creditBillId: z.string().uuid(),
  amount: z.number().positive(),
  paymentDate: z.string().datetime(),
  paymentMethod: z.enum(['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'OTHER']),
  notes: z.string().optional(),
});

// Daily Bill schemas
export const createDailyBillSchema = z.object({
  customerId: z.string().uuid(),
  billNumber: z.string().min(1),
  billAmount: z.number().positive(),
  status: z.enum(['PAID', 'UNPAID', 'CREDIT_BILL']),
  paymentMethod: z.string().optional().nullable(),
  billDate: z.string().datetime(),
});

export const updateDailyBillSchema = createDailyBillSchema.partial().extend({
  billAmount: z.number().positive().optional(),
});

export const importDailyBillsSchema = z.array(z.object({
  billDate: z.string().datetime(),
  billNumber: z.string().min(1),
  billAmount: z.number().positive(),
  customerId: z.string().optional(),
  newCustomerName: z.string().optional()
}).refine(data => data.customerId || data.newCustomerName, {
  message: 'Either customerId or newCustomerName must be provided'
}));

