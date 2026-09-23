export interface Business {
  id: string;
  name: string;
  business_code: string;
  currency: string;
  country: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  business_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type UserRole = 'OWNER' | 'MANAGER' | 'CASHIER' | 'STAFF';

export interface Category {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  business_id: string;
  category_id: string | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  unit: string;
  selling_price: number;
  average_cost: number;
  reorder_level: number;
  track_inventory: boolean;
  active: boolean;
  current_stock?: number | null;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  business_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  business_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  credit_limit: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StockMovement {
  id: string;
  business_id: string;
  product_id: string;
  type: StockMovementType;
  quantity: number;
  unit_cost: number;
  reference_type: ReferenceType | null;
  reference_id: string | null;
  occurred_at: string;
  created_by: string;
  device_id: string;
  sync_status: SyncStatus;
  created_at: string;
  updated_at: string;
}

export type StockMovementType =
  | 'opening'
  | 'purchase'
  | 'sale'
  | 'return_in'
  | 'return_out'
  | 'adjustment_in'
  | 'adjustment_out'
  | 'damaged';

export type ReferenceType =
  | 'purchase'
  | 'sale'
  | 'purchase_return'
  | 'sale_return'
  | 'adjustment'
  | 'opening_balance';

export interface Purchase {
  id: string;
  business_id: string;
  supplier_id: string;
  reference_number: string | null;
  total_amount: number;
  paid_amount: number;
  status: PurchaseStatus;
  purchase_date: string;
  notes: string | null;
  created_by: string;
  device_id: string;
  sync_status: SyncStatus;
  created_at: string;
  updated_at: string;
}

export type PurchaseStatus = 'pending' | 'completed' | 'cancelled';

export interface PurchaseItem {
  id: string;
  business_id: string;
  purchase_id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  created_at: string;
  updated_at: string;
}

export interface Sale {
  id: string;
  business_id: string;
  customer_id: string | null;
  reference_number: string | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  voided: boolean;
  payment_status: PaymentStatus;
  sale_date: string;
  notes: string | null;
  created_by: string;
  device_id: string;
  sync_status: SyncStatus;
  created_at: string;
  updated_at: string;
  items?: SaleItem[];
}

export type PaymentStatus = 'paid' | 'partial' | 'unpaid' | 'credit';

export interface SaleItem {
  id: string;
  business_id: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  selling_price: number;
  unit_cost: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  created_at: string;
  updated_at: string;
}

export interface Expense {
  id: string;
  business_id: string;
  category: ExpenseCategory;
  amount: number;
  payment_method: PaymentMethod;
  description: string | null;
  expense_date: string;
  reference_number: string | null;
  created_by: string;
  device_id: string;
  sync_status: SyncStatus;
  created_at: string;
  updated_at: string;
}

export type ExpenseCategory =
  | 'transport'
  | 'rent'
  | 'electricity'
  | 'water'
  | 'food'
  | 'salary'
  | 'communication'
  | 'maintenance'
  | 'tax'
  | 'other';

export interface Payment {
  id: string;
  business_id: string;
  type: PaymentType;
  payment_method: PaymentMethod;
  amount: number;
  reference_type: PaymentReferenceType | null;
  reference_id: string | null;
  party_id: string | null;
  payment_date: string;
  notes: string | null;
  created_by: string;
  device_id: string;
  sync_status: SyncStatus;
  created_at: string;
  updated_at: string;
}

export type PaymentType =
  | 'customer_payment'
  | 'supplier_payment'
  | 'sale_payment'
  | 'purchase_payment'
  | 'expense_payment'
  | 'withdrawal'
  | 'other_income';

export type PaymentMethod = 'cash' | 'mobile_money' | 'bank' | 'credit';

export type PaymentReferenceType =
  | 'sale'
  | 'purchase'
  | 'expense'
  | 'customer'
  | 'supplier'
  | 'withdrawal'
  | 'other';

export interface DailyClosing {
  id: string;
  business_id: string;
  business_date: string;
  opening_cash: number;
  cash_sales: number;
  customer_cash_payments: number;
  other_cash_income: number;
  cash_purchases: number;
  cash_expenses: number;
  supplier_cash_payments: number;
  withdrawals: number;
  expected_cash: number;
  actual_cash: number;
  cash_variance: number;
  total_sales: number;
  cogs: number;
  gross_profit: number;
  expenses: number;
  net_profit: number;
  opening_stock_qty: number;
  opening_stock_value: number;
  closing_stock_qty: number;
  closing_stock_value: number;
  notes: string | null;
  closed_by: string | null;
  closed_at: string | null;
  status: DailyClosingStatus;
  created_at: string;
  updated_at: string;
}

export type DailyClosingStatus = 'open' | 'closed' | 'reopened';

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface SyncRecord {
  id: string;
  table_name: string;
  record_id: string;
  business_id: string;
  operation: 'insert' | 'update' | 'delete';
  payload: string | Record<string, unknown>;
  device_id: string;
  status: SyncStatus;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

export interface DashboardStats {
  todaySales: number;
  todayGrossProfit: number;
  todayNetProfit: number;
  todayExpenses: number;
  itemsSold: number;
  stockValue: number;
}

export interface ReportFilters {
  startDate: string;
  endDate: string;
  period: ReportPeriod;
}

export type ReportPeriod =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'custom';

export interface SalesReport {
  totalSales: number;
  totalCOGS: number;
  grossProfit: number;
  grossMargin: number;
  netProfit: number;
  totalExpenses: number;
  itemsSold: number;
  transactionCount: number;
  averageTransactionValue: number;
  stockValue: number;
  topProducts: TopProduct[];
  paymentBreakdown: PaymentBreakdown[];
}

export interface TopProduct {
  productId: string;
  productName: string;
  quantitySold: number;
  totalSales: number;
  totalProfit: number;
  margin: number;
}

export interface PaymentBreakdown {
  paymentMethod: PaymentMethod;
  amount: number;
  count: number;
}

export interface StockReport {
  productId: string;
  productName: string;
  sku: string | null;
  currentStock: number;
  reorderLevel: number;
  stockValue: number;
  averageCost: number;
  sellingPrice: number;
  isLowStock: boolean;
}

export interface FinancialSummary {
  sales: number;
  cogs: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
}

export interface CashReconciliation {
  openingCash: number;
  cashSales: number;
  customerCashPayments: number;
  otherCashIncome: number;
  cashPurchases: number;
  cashExpenses: number;
  supplierCashPayments: number;
  withdrawals: number;
  expectedCash: number;
  actualCash: number;
  variance: number;
}