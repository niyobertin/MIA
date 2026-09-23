import { BaseRepository } from '../base';
import { Sale, SaleItem, PaymentStatus } from '@/types';
import { buildPeriodWhere } from '@/utils/periodBounds';

export class SaleRepository extends BaseRepository<Sale> {
  protected tableName = 'sales';
  protected columns = [
    'id', 'business_id', 'customer_id', 'reference_number', 'subtotal',
    'discount_amount', 'tax_amount', 'total_amount', 'paid_amount', 'voided', 'payment_status', 'sale_date',
    'notes', 'created_by', 'device_id', 'sync_status', 'created_at', 'updated_at'
  ];

  protected mapRow(row: Record<string, unknown>): Sale {
    const sale = super.mapRow(row);
    return {
      ...sale,
      paid_amount: Number(row.paid_amount ?? 0),
      voided: row.voided === 1 || row.voided === true,
    };
  }

  async findByCustomer(customerId: string, businessId: string): Promise<Sale[]> {
    return this.findAll(businessId, { where: { customer_id: customerId } });
  }

  async findByStatus(businessId: string, status: PaymentStatus): Promise<Sale[]> {
    return this.findAll(businessId, { where: { payment_status: status } });
  }

  async findByDateRange(businessId: string, startDate: string, endDate: string): Promise<Sale[]> {
    const db = await this.getDb();
    const period = buildPeriodWhere('sale_date', 'created_at', startDate, endDate);
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM ${this.tableName}
       WHERE business_id = ? AND ${period.clause}
       ORDER BY created_at DESC`,
      [businessId, ...period.params]
    );
    return rows.map(row => this.mapRow(row));
  }

  async getTotalSales(businessId: string, startDate: string, endDate: string): Promise<number> {
    const db = await this.getDb();
    const period = buildPeriodWhere('sale_date', 'created_at', startDate, endDate);
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(total_amount), 0) as total
       FROM ${this.tableName}
       WHERE business_id = ? AND voided = 0 AND ${period.clause}`,
      [businessId, ...period.params]
    );
    return row?.total ?? 0;
  }

  async countInPeriod(businessId: string, startDate: string, endDate: string): Promise<number> {
    const db = await this.getDb();
    const period = buildPeriodWhere('sale_date', 'created_at', startDate, endDate);
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COUNT(*) as total
       FROM ${this.tableName}
       WHERE business_id = ? AND voided = 0 AND ${period.clause}`,
      [businessId, ...period.params]
    );
    return row?.total ?? 0;
  }

  async getTotalTax(businessId: string, startDate: string, endDate: string): Promise<number> {
    const db = await this.getDb();
    const period = buildPeriodWhere('sale_date', 'created_at', startDate, endDate);
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(tax_amount), 0) as total
       FROM ${this.tableName}
       WHERE business_id = ? AND voided = 0 AND ${period.clause}`,
      [businessId, ...period.params]
    );
    return row?.total ?? 0;
  }

  async getReceivableInPeriod(businessId: string, startDate: string, endDate: string): Promise<number> {
    const db = await this.getDb();
    const period = buildPeriodWhere('sale_date', 'created_at', startDate, endDate);
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(total_amount - paid_amount), 0) as total
       FROM ${this.tableName}
       WHERE business_id = ? AND voided = 0 AND ${period.clause}`,
      [businessId, ...period.params]
    );
    return row?.total ?? 0;
  }

  async getCustomerPosition(
    customerId: string,
    businessId: string
  ): Promise<{ owed: number; paid: number; outstanding: number }> {
    const db = await this.getDb();
    const sales = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(total_amount), 0) as total
       FROM sales
       WHERE business_id = ? AND customer_id = ? AND voided = 0`,
      [businessId, customerId]
    );
    const checkout = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(p.amount), 0) as total
       FROM payments p
       JOIN sales s ON s.id = p.reference_id AND s.business_id = p.business_id
       WHERE p.business_id = ? AND p.type = 'sale_payment' AND p.reference_type = 'sale'
         AND s.customer_id = ? AND s.voided = 0`,
      [businessId, customerId]
    );
    const later = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM payments
       WHERE business_id = ? AND type = 'customer_payment' AND party_id = ?`,
      [businessId, customerId]
    );
    const salesTotal = sales?.total ?? 0;
    const checkoutPaid = checkout?.total ?? 0;
    const laterPaid = later?.total ?? 0;
    const owed = salesTotal - checkoutPaid;
    return {
      owed,
      paid: laterPaid,
      outstanding: owed - laterPaid,
    };
  }

  async listCustomerPositions(businessId: string): Promise<Array<{ customer_id: string; owed: number; paid: number; outstanding: number }>> {
    const db = await this.getDb();
    const rows = await db.getAllAsync<{ customer_id: string; sales_total: number; checkout_paid: number; later_paid: number }>(
      `SELECT
         c.id as customer_id,
         COALESCE(SUM(s.total_amount), 0) as sales_total,
         (
           SELECT COALESCE(SUM(p.amount), 0)
           FROM payments p
           JOIN sales s2 ON s2.id = p.reference_id AND s2.business_id = p.business_id
           WHERE p.business_id = c.business_id
             AND p.type = 'sale_payment'
             AND p.reference_type = 'sale'
             AND s2.customer_id = c.id
             AND s2.voided = 0
         ) as checkout_paid,
         (
           SELECT COALESCE(SUM(p.amount), 0)
           FROM payments p
           WHERE p.business_id = c.business_id
             AND p.type = 'customer_payment'
             AND p.party_id = c.id
         ) as later_paid
       FROM customers c
       LEFT JOIN sales s ON s.customer_id = c.id AND s.business_id = c.business_id AND s.voided = 0
       WHERE c.business_id = ? AND c.active = 1
       GROUP BY c.id`,
      [businessId]
    );
    return rows.map((row) => {
      const owed = row.sales_total - row.checkout_paid;
      return {
        customer_id: row.customer_id,
        owed,
        paid: row.later_paid,
        outstanding: owed - row.later_paid,
      };
    });
  }

  async getCashSales(businessId: string, startDate: string, endDate: string): Promise<number> {
    const db = await this.getDb();
    const period = buildPeriodWhere('s.sale_date', 's.created_at', startDate, endDate);
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(p.amount), 0) as total
       FROM ${this.tableName} s
       JOIN payments p ON p.reference_type = 'sale' AND p.reference_id = s.id AND p.business_id = s.business_id
       WHERE s.business_id = ? AND ${period.clause}
       AND s.voided = 0
       AND p.type = 'sale_payment'
       AND p.payment_method = 'cash'`,
      [businessId, ...period.params]
    );
    return row?.total ?? 0;
  }

  async getSalesWithItems(businessId: string, startDate: string, endDate: string): Promise<(Sale & { items: SaleItem[] })[]> {
    const sales = await this.findByDateRange(businessId, startDate, endDate);
    const result: (Sale & { items: SaleItem[] })[] = [];

    for (const sale of sales) {
      const items = await saleItemRepository.findBySale(sale.id, businessId);
      result.push({ ...sale, items });
    }

    return result;
  }
}

export class SaleItemRepository extends BaseRepository<SaleItem> {
  protected tableName = 'sale_items';
  protected columns = [
    'id', 'business_id', 'sale_id', 'product_id', 'quantity', 'selling_price',
    'unit_cost', 'discount_amount', 'tax_amount', 'total_amount', 'created_at', 'updated_at'
  ];

  async findBySale(saleId: string, businessId: string): Promise<SaleItem[]> {
    return this.findAll(businessId, { where: { sale_id: saleId } });
  }

  async findByProduct(productId: string, businessId: string): Promise<SaleItem[]> {
    return this.findAll(businessId, { where: { product_id: productId } });
  }

  async getTotalQuantitySold(productId: string, businessId: string, startDate: string, endDate: string): Promise<number> {
    const db = await this.getDb();
    const period = buildPeriodWhere('s.sale_date', 's.created_at', startDate, endDate);
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(si.quantity), 0) as total
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       WHERE si.product_id = ? AND si.business_id = ? AND s.voided = 0 AND ${period.clause}`,
      [productId, businessId, ...period.params]
    );
    return row?.total ?? 0;
  }

  async getTotalSalesAmount(productId: string, businessId: string, startDate: string, endDate: string): Promise<number> {
    const db = await this.getDb();
    const period = buildPeriodWhere('s.sale_date', 's.created_at', startDate, endDate);
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(si.total_amount), 0) as total
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       WHERE si.product_id = ? AND si.business_id = ? AND s.voided = 0 AND ${period.clause}`,
      [productId, businessId, ...period.params]
    );
    return row?.total ?? 0;
  }

  async getTotalProfit(productId: string, businessId: string, startDate: string, endDate: string): Promise<number> {
    const db = await this.getDb();
    const period = buildPeriodWhere('s.sale_date', 's.created_at', startDate, endDate);
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(si.total_amount - si.tax_amount - si.quantity * si.unit_cost), 0) as total
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       WHERE si.product_id = ? AND si.business_id = ? AND s.voided = 0 AND ${period.clause}`,
      [productId, businessId, ...period.params]
    );
    return row?.total ?? 0;
  }
}

export const saleRepository = new SaleRepository();
export const saleItemRepository = new SaleItemRepository();
