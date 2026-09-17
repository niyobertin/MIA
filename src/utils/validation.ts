import { z } from 'zod';

export const createBusinessSchema = z.object({
  name: z.string().min(2, 'Business name must be at least 2 characters'),
  currency: z.string().default('RWF'),
  country: z.string().default('Rwanda'),
  timezone: z.string().default('Africa/Kigali'),
});

export const createProductSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  category_id: z.string().optional(),
  unit: z.string().default('pcs'),
  selling_price: z.number().int().nonnegative('Selling price must be non-negative'),
  average_cost: z.number().int().nonnegative('Average cost must be non-negative'),
  reorder_level: z.number().int().nonnegative().default(0),
  track_inventory: z.boolean().default(true),
});

export const createCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required'),
  description: z.string().optional(),
});

export const createSupplierSchema = z.object({
  name: z.string().min(1, 'Supplier name is required'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  address: z.string().optional(),
});

export const createCustomerSchema = z.object({
  name: z.string().min(1, 'Customer name is required'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  address: z.string().optional(),
  credit_limit: z.number().int().nonnegative().default(0),
});

export const createSaleSchema = z.object({
  customer_id: z.string().optional(),
  items: z.array(z.object({
    product_id: z.string().uuid('Invalid product ID'),
    quantity: z.number().int().positive('Quantity must be positive'),
    selling_price: z.number().int().nonnegative('Price must be non-negative'),
    discount_amount: z.number().int().nonnegative().default(0),
    tax_amount: z.number().int().nonnegative().default(0),
  })).min(1, 'At least one item is required'),
  payment_method: z.enum(['cash', 'mobile_money', 'bank', 'credit']),
  notes: z.string().optional(),
});

export const createPurchaseSchema = z.object({
  supplier_id: z.string().uuid('Invalid supplier ID'),
  items: z.array(z.object({
    product_id: z.string().uuid('Invalid product ID'),
    quantity: z.number().int().positive('Quantity must be positive'),
    unit_cost: z.number().int().nonnegative('Unit cost must be non-negative'),
  })).min(1, 'At least one item is required'),
  payment_method: z.enum(['cash', 'mobile_money', 'bank', 'credit']),
  reference_number: z.string().optional(),
  notes: z.string().optional(),
});

export const createExpenseSchema = z.object({
  category: z.enum(['transport', 'rent', 'electricity', 'water', 'food', 'salary', 'communication', 'maintenance', 'tax', 'other']),
  amount: z.number().int().positive('Amount must be positive'),
  payment_method: z.enum(['cash', 'mobile_money', 'bank', 'credit']),
  description: z.string().optional(),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  reference_number: z.string().optional(),
});

export const createPaymentSchema = z.object({
  type: z.enum(['customer_payment', 'supplier_payment', 'sale_payment', 'purchase_payment', 'expense_payment', 'withdrawal', 'other_income']),
  payment_method: z.enum(['cash', 'mobile_money', 'bank', 'credit']),
  amount: z.number().int().positive('Amount must be positive'),
  reference_type: z.enum(['sale', 'purchase', 'expense', 'customer', 'supplier', 'withdrawal', 'other']).optional(),
  reference_id: z.string().uuid().optional(),
  party_id: z.string().uuid().optional(),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  notes: z.string().optional(),
});

export const closeDaySchema = z.object({
  business_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  opening_cash: z.number().int().nonnegative('Opening cash must be non-negative'),
  actual_cash: z.number().int().nonnegative('Actual cash must be non-negative'),
  notes: z.string().optional(),
});

export const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  phone: z.string().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['OWNER', 'MANAGER', 'CASHIER', 'STAFF']),
});

export const registerAccountSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email'),
  phone: z.string().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const joinBusinessSchema = z.object({
  businessCode: z.string().min(6, 'Enter a valid business code'),
});

export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type CloseDayInput = z.infer<typeof closeDaySchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type RegisterAccountInput = z.infer<typeof registerAccountSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type JoinBusinessInput = z.infer<typeof joinBusinessSchema>;