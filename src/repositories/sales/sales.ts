import { BaseRepository } from '../base';
import { Sale, SaleItem, PaymentStatus } from '@/types';
import { getDatabase } from '../../db/database';

export class SaleRepository extends BaseRepository<Sale> {
  protected tableName = 'sales';
  protected columns = [
    'id', 'business_id', 'customer_id', 'reference_number', 'subtotal',
    'discount_amount', 'tax_amount', 'total_amount', 'payment_status', 'sale_date',
    'notes', 'created_by', 'device_id', 'sync_status', 'created_at', 'updated_at'
  ];

  async findByCustomer(customerId: string, businessId: string): Promise<Sale[]> {
    return this.findAll(businessId, { where: { customer_id: customerId } });
  }

  async findByStatus(businessId: string, status: PaymentStatus): Promise<Sale[]> {
    return this.findAll(businessId, { where: { payment_status: status } });
  }

  async findByDateRange(businessId: string, startDate: string, endDate: string): Promise<Sale[]> {
    const db = await this.getDb();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM ${this.tableName}
       WHERE business_id = ? AND sale_date BETWEEN ? AND ?
       ORDER BY sale_date DESC`,
      [businessId, startDate, endDate]
    );
    return rows.map(row => this.mapRow(row));
  }

  async getTotalSales(businessId: string, startDate: string, endDate: string): Promise<number> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(total_amount), 0) as total
       FROM ${this.tableName}
       WHERE business_id = ? AND sale_date BETWEEN ? AND ?`,
      [businessId, startDate, endDate]
    );
    return row?.total ?? 0;
  }

  async getCashSales(businessId: string, startDate: string, endDate: string): Promise<number> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(s.total_amount), 0) as total
       FROM ${this.tableName} s
       JOIN payments p ON p.reference_type = 'sale' AND p.reference_id = s.id
       WHERE s.business_id = ? AND s.sale_date BETWEEN ? AND ? 
       AND p.payment_method = 'cash'`,
      [businessId, startDate, endDate]
    );
    return row?.total ?? 0;
  }

  async getSalesWithItems(businessId: string, startDate: string, endDate: string): Promise<(Sale & { items: SaleItem[] })[]> {
    const db = await this.getDb();
    const sales = await this.findByDateRange(businessId, startDate, endDate);
    
    for (const sale of sales) {
      sale.items = await saleItemRepository.findBySale(sale.id, businessId);
    }
    
    return sales;
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
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(si.quantity), 0) as total
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       WHERE si.product_id = ? AND si.business_id = ? AND s.sale_date BETWEEN ? AND ?`,
      [productId, businessId, startDate, endDate]
    );
    return row?.total ?? 0;
  }

  async getTotalSalesAmount(productId: string, businessId: string, startDate: string, endDate: string): Promise<number> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(si.total_amount), 0) as total
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       WHERE si.product_id = ? AND si.business_id = ? AND s.sale_date BETWEEN ? AND ?`,
      [productId, businessId, startDate, endDate]
    );
    return row?.total ?? 0;
  }

  async getTotalProfit(productId: string, businessId: string, startDate: string, endDate: string): Promise<number> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(si.quantity * (si.selling_price - si.unit_cost)), 0) as total
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       WHERE si.product_id = ? AND si.business_id = ? AND s.sale_date BETWEEN ? AND ?`,
      [productId, businessId, startDate, endDate]
    );
    return row?.total ?? 0;
  }
}

export const saleRepository = new SaleRepository();
export const saleItemRepository = new SaleItemRepository();