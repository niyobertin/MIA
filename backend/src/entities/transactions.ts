import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

const bigIntNumber = {
  to: (v: number | null | undefined) => (v == null ? v : String(v)),
  from: (v: string | null) => (v == null ? 0 : Number(v)),
};

@Entity('stock_movements')
export class StockMovement {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  business_id!: string;

  @Column({ type: 'uuid' })
  product_id!: string;

  @Column({ type: 'text' })
  type!: string;

  @Column({ type: 'bigint', transformer: bigIntNumber })
  quantity!: number;

  @Column({ type: 'bigint', default: 0, transformer: bigIntNumber })
  unit_cost!: number;

  @Column({ type: 'text', nullable: true })
  reference_type!: string | null;

  @Column({ type: 'uuid', nullable: true })
  reference_id!: string | null;

  @Column({ type: 'timestamptz' })
  occurred_at!: Date;

  @Column({ type: 'bigint', default: 0, transformer: bigIntNumber })
  previous_quantity!: number;

  @Column({ type: 'bigint', default: 0, transformer: bigIntNumber })
  new_quantity!: number;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ type: 'uuid', nullable: true })
  reversal_of!: string | null;

  @Column({ type: 'uuid' })
  created_by!: string;

  @Column({ type: 'text' })
  device_id!: string;

  @Column({ type: 'text', default: 'pending' })
  sync_status!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}

@Entity('purchases')
export class Purchase {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  business_id!: string;

  @Column({ type: 'uuid' })
  supplier_id!: string;

  @Column({ type: 'text', nullable: true })
  reference_number!: string | null;

  @Column({ type: 'bigint', default: 0, transformer: bigIntNumber })
  total_amount!: number;

  @Column({ type: 'bigint', default: 0, transformer: bigIntNumber })
  paid_amount!: number;

  @Column({ type: 'text', default: 'pending' })
  status!: string;

  @Column({ type: 'timestamptz' })
  purchase_date!: Date;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'uuid' })
  created_by!: string;

  @Column({ type: 'text' })
  device_id!: string;

  @Column({ type: 'text', default: 'pending' })
  sync_status!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}

@Entity('purchase_items')
export class PurchaseItem {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  business_id!: string;

  @Column({ type: 'uuid' })
  purchase_id!: string;

  @Column({ type: 'uuid' })
  product_id!: string;

  @Column({ type: 'bigint', transformer: bigIntNumber })
  quantity!: number;

  @Column({ type: 'bigint', transformer: bigIntNumber })
  unit_cost!: number;

  @Column({ type: 'bigint', transformer: bigIntNumber })
  total_cost!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}

@Entity('sales')
export class Sale {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  business_id!: string;

  @Column({ type: 'uuid', nullable: true })
  customer_id!: string | null;

  @Column({ type: 'text', nullable: true })
  reference_number!: string | null;

  @Column({ type: 'bigint', default: 0, transformer: bigIntNumber })
  subtotal!: number;

  @Column({ type: 'bigint', default: 0, transformer: bigIntNumber })
  discount_amount!: number;

  @Column({ type: 'bigint', default: 0, transformer: bigIntNumber })
  tax_amount!: number;

  @Column({ type: 'bigint', default: 0, transformer: bigIntNumber })
  total_amount!: number;

  @Column({ type: 'bigint', default: 0, transformer: bigIntNumber })
  paid_amount!: number;

  @Column({ type: 'boolean', default: false })
  voided!: boolean;

  @Column({ type: 'text', default: 'unpaid' })
  payment_status!: string;

  @Column({ type: 'timestamptz' })
  sale_date!: Date;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'uuid' })
  created_by!: string;

  @Column({ type: 'text' })
  device_id!: string;

  @Column({ type: 'text', default: 'pending' })
  sync_status!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}

@Entity('sale_items')
export class SaleItem {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  business_id!: string;

  @Column({ type: 'uuid' })
  sale_id!: string;

  @Column({ type: 'uuid' })
  product_id!: string;

  @Column({ type: 'bigint', transformer: bigIntNumber })
  quantity!: number;

  @Column({ type: 'bigint', transformer: bigIntNumber })
  selling_price!: number;

  @Column({ type: 'bigint', transformer: bigIntNumber })
  unit_cost!: number;

  @Column({ type: 'bigint', default: 0, transformer: bigIntNumber })
  discount_amount!: number;

  @Column({ type: 'bigint', default: 0, transformer: bigIntNumber })
  tax_amount!: number;

  @Column({ type: 'bigint', transformer: bigIntNumber })
  total_amount!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}

@Entity('expenses')
export class Expense {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  business_id!: string;

  @Column({ type: 'text' })
  category!: string;

  @Column({ type: 'bigint', transformer: bigIntNumber })
  amount!: number;

  @Column({ type: 'text' })
  payment_method!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'timestamptz' })
  expense_date!: Date;

  @Column({ type: 'text', nullable: true })
  reference_number!: string | null;

  @Column({ type: 'uuid' })
  created_by!: string;

  @Column({ type: 'text' })
  device_id!: string;

  @Column({ type: 'text', default: 'pending' })
  sync_status!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}

@Entity('payments')
export class Payment {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  business_id!: string;

  @Column({ type: 'text' })
  type!: string;

  @Column({ type: 'text' })
  payment_method!: string;

  @Column({ type: 'bigint', transformer: bigIntNumber })
  amount!: number;

  @Column({ type: 'text', nullable: true })
  reference_type!: string | null;

  @Column({ type: 'uuid', nullable: true })
  reference_id!: string | null;

  @Column({ type: 'uuid', nullable: true })
  party_id!: string | null;

  @Column({ type: 'timestamptz' })
  payment_date!: Date;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'uuid' })
  created_by!: string;

  @Column({ type: 'text' })
  device_id!: string;

  @Column({ type: 'text', default: 'pending' })
  sync_status!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}

@Entity('daily_closings')
@Unique(['business_id', 'business_date'])
export class DailyClosing {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  business_id!: string;

  @Column({ type: 'date' })
  business_date!: string;

  @Column({ type: 'bigint', default: 0, transformer: bigIntNumber })
  opening_cash!: number;

  @Column({ type: 'bigint', default: 0, transformer: bigIntNumber })
  cash_sales!: number;

  @Column({ type: 'bigint', default: 0, transformer: bigIntNumber })
  customer_cash_payments!: number;

  @Column({ type: 'bigint', default: 0, transformer: bigIntNumber })
  other_cash_income!: number;

  @Column({ type: 'bigint', default: 0, transformer: bigIntNumber })
  cash_purchases!: number;

  @Column({ type: 'bigint', default: 0, transformer: bigIntNumber })
  cash_expenses!: number;

  @Column({ type: 'bigint', default: 0, transformer: bigIntNumber })
  supplier_cash_payments!: number;

  @Column({ type: 'bigint', default: 0, transformer: bigIntNumber })
  withdrawals!: number;

  @Column({ type: 'bigint', default: 0, transformer: bigIntNumber })
  expected_cash!: number;

  @Column({ type: 'bigint', default: 0, transformer: bigIntNumber })
  actual_cash!: number;

  @Column({ type: 'bigint', default: 0, transformer: bigIntNumber })
  cash_variance!: number;

  @Column({ type: 'bigint', default: 0, transformer: bigIntNumber })
  total_sales!: number;

  @Column({ type: 'bigint', default: 0, transformer: bigIntNumber })
  cogs!: number;

  @Column({ type: 'bigint', default: 0, transformer: bigIntNumber })
  gross_profit!: number;

  @Column({ type: 'bigint', default: 0, transformer: bigIntNumber })
  expenses!: number;

  @Column({ type: 'bigint', default: 0, transformer: bigIntNumber })
  net_profit!: number;

  @Column({ type: 'bigint', default: 0, transformer: bigIntNumber })
  opening_stock_qty!: number;

  @Column({ type: 'bigint', default: 0, transformer: bigIntNumber })
  opening_stock_value!: number;

  @Column({ type: 'bigint', default: 0, transformer: bigIntNumber })
  closing_stock_qty!: number;

  @Column({ type: 'bigint', default: 0, transformer: bigIntNumber })
  closing_stock_value!: number;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'uuid', nullable: true })
  opened_by!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  opened_at!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  closed_by!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  closed_at!: Date | null;

  @Column({ type: 'text', default: 'open' })
  status!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}

@Entity('daily_stock_lines')
@Unique(['business_id', 'business_date', 'product_id'])
export class DailyStockLine {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  business_id!: string;

  @Column({ type: 'uuid' })
  daily_closing_id!: string;

  @Column({ type: 'date' })
  business_date!: string;

  @Column({ type: 'uuid' })
  product_id!: string;

  @Column({ type: 'bigint', default: 0, transformer: bigIntNumber })
  opening_qty!: number;

  @Column({ type: 'bigint', default: 0, transformer: bigIntNumber })
  opening_unit_cost!: number;

  @Column({ type: 'bigint', nullable: true, transformer: {
    to: (v: number | null | undefined) => (v == null ? null : String(v)),
    from: (v: string | null) => (v == null ? null : Number(v)),
  } })
  closing_qty!: number | null;

  @Column({ type: 'bigint', nullable: true, transformer: {
    to: (v: number | null | undefined) => (v == null ? null : String(v)),
    from: (v: string | null) => (v == null ? null : Number(v)),
  } })
  closing_unit_cost!: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
