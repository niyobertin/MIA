export const CURRENCY = 'RWF';
export const DEFAULT_COUNTRY = 'Rwanda';
export const DEFAULT_TIMEZONE = 'Africa/Kigali';

export const EXPENSE_CATEGORIES = [
  { value: 'transport', label: 'Transport', labelRw: 'Guhurira' },
  { value: 'rent', label: 'Rent', labelRw: 'Kodera' },
  { value: 'electricity', label: 'Electricity', labelRw: 'Amajwi' },
  { value: 'water', label: 'Water', labelRw: 'Amazi' },
  { value: 'food', label: 'Food', labelRw: 'Ibibi' },
  { value: 'salary', label: 'Salary', labelRw: 'Amafaranga y\'Umushahara' },
  { value: 'communication', label: 'Communication', labelRw: 'Mvugire' },
  { value: 'maintenance', label: 'Maintenance', labelRw: 'Kubungabunga' },
  { value: 'tax', label: 'Tax', labelRw: 'Aka' },
  { value: 'other', label: 'Other', labelRw: 'Bindi' },
] as const;

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash', labelRw: 'Amafaranga' },
  { value: 'mobile_money', label: 'Mobile Money', labelRw: 'Mobi Moni' },
  { value: 'bank', label: 'Bank', labelRw: 'Bangi' },
  { value: 'credit', label: 'Credit', labelRw: 'Umuvunanyo' },
] as const;

export const USER_ROLES = [
  { value: 'OWNER', label: 'Owner', labelRw: 'Umuneza' },
  { value: 'MANAGER', label: 'Manager', labelRw: 'Umucuruzi' },
  { value: 'CASHIER', label: 'Cashier', labelRw: 'Umushyingizanyo' },
  { value: 'STAFF', label: 'Staff', labelRw: 'Umukozi' },
] as const;

export const STOCK_MOVEMENT_TYPES = [
  { value: 'opening', label: 'Opening Balance', labelRw: 'Ibibatangaza' },
  { value: 'purchase', label: 'Purchase', labelRw: 'Kwugura' },
  { value: 'sale', label: 'Sale', labelRw: 'Gukurisha' },
  { value: 'return_in', label: 'Return In', labelRw: 'Gusubira Mu Ndi' },
  { value: 'return_out', label: 'Return Out', labelRw: 'Gusubira Hanze' },
  { value: 'adjustment_in', label: 'Adjustment In', labelRw: 'Kwongera Mu Ndi' },
  { value: 'adjustment_out', label: 'Adjustment Out', labelRw: 'Kwongera Hanze' },
  { value: 'damaged', label: 'Damaged', labelRw: 'Bibabaye' },
] as const;

export const REPORT_PERIODS = [
  { value: 'today', label: 'Today', labelRw: 'Uyu Munsi' },
  { value: 'yesterday', label: 'Yesterday', labelRw: 'Ejo' },
  { value: 'this_week', label: 'This Week', labelRw: 'Iyi Cyumweru' },
  { value: 'last_week', label: 'Last Week', labelRw: 'Icyumweru Gishize' },
  { value: 'this_month', label: 'This Month', labelRw: 'Uyu Kwezi' },
  { value: 'last_month', label: 'Last Month', labelRw: 'Ukwezi Gushize' },
  { value: 'custom', label: 'Custom Range', labelRw: 'Akagari Gasohotse' },
] as const;

export const DAILY_CLOSING_STATUS = [
  { value: 'open', label: 'Open', labelRw: 'Wafunguriwe' },
  { value: 'closed', label: 'Closed', labelRw: 'Wafungiye' },
  { value: 'reopened', label: 'Reopened', labelRw: 'Wafunguriwe Nyuma' },
] as const;

export const SYNC_STATUSES = [
  { value: 'pending', label: 'Pending', labelRw: 'Bisubiye' },
  { value: 'syncing', label: 'Syncing', labelRw: 'Bikorera' },
  { value: 'synced', label: 'Synced', labelRw: 'Byahariye' },
  { value: 'failed', label: 'Failed', labelRw: 'Byanze' },
] as const;

export const PURCHASE_STATUS = [
  { value: 'pending', label: 'Pending', labelRw: 'Bisubiye' },
  { value: 'completed', label: 'Completed', labelRw: 'Byagenze' },
  { value: 'cancelled', label: 'Cancelled', labelRw: 'Byagaragajwe' },
] as const;

export const PAYMENT_STATUS = [
  { value: 'paid', label: 'Paid', labelRw: 'Yashyutse' },
  { value: 'partial', label: 'Partial', labelRw: 'Yashyutse Bwite' },
  { value: 'unpaid', label: 'Unpaid', labelRw: 'Ntayishyuwe' },
  { value: 'credit', label: 'Credit', labelRw: 'Umuvunanyo' },
] as const;

export const PAYMENT_TYPES = [
  { value: 'customer_payment', label: 'Customer Payment', labelRw: 'Kwishyura Umugezi' },
  { value: 'supplier_payment', label: 'Supplier Payment', labelRw: 'Kwishyura Umuhafi' },
  { value: 'sale_payment', label: 'Sale Payment', labelRw: 'Kwishyura Ibicurwa' },
  { value: 'purchase_payment', label: 'Purchase Payment', labelRw: 'Kwishyura Kwugura' },
  { value: 'expense_payment', label: 'Expense Payment', labelRw: 'Kwishyura Ibyakoreshejwe' },
  { value: 'withdrawal', label: 'Withdrawal', labelRw: 'Gukuramo' },
  { value: 'other_income', label: 'Other Income', labelRw: 'Inguzanyo Zindi' },
] as const;

export const UNITS = [
  'pcs', 'kg', 'g', 'l', 'ml', 'm', 'cm', 'box', 'pack', 'dozen', 'roll', 'bag',
] as const;

export const APP_VERSION = '1.0.0';
export const APP_NAME = 'MIA';

export const STORAGE_KEYS = {
  AUTH: 'mia-auth',
  UI: 'mia-ui',
  SYNC: 'mia-sync',
  SETTINGS: 'mia-settings',
} as const;