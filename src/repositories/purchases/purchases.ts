import { BaseRepository } from '../base';
import { Purchase, PurchaseItem, PurchaseStatus } from '@/types';
import { getDatabase } from '../../db/database';
import { productRepository, stockMovementRepository } from '../products/products';
import { paymentRepository } from '../payments/payments';
import { financialService } from '../../services/financial/calculations';

export class PurchaseRepository extends BaseRepository<Purchase> {
  protected tableName = 'purchases';
  protected columns = [
    'id', 'business_id', 'supplier_id', 'reference_number', 'total_amount',
    'paid_amount', 'status', 'purchase_date', 'notes', 'created_by', 'device_id', 'sync_status', 'created_at', 'updated_at'
  ];

  async findBySupplier(supplierId: string, businessId: string): Promise<Purchase[]> {
    return this.findAll(businessId, { where: { supplier_id: supplierId } });
  }

  async findByStatus(businessId: string, status: PurchaseStatus): Promise<Purchase[]> {
    return this.findAll(businessId, { where: { status } });
  }

  async findByDateRange(businessId: string, startDate: string, endDate: string): Promise<Purchase[]> {
    const db = await this.getDb();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM ${this.tableName}
       WHERE business_id = ? AND purchase_date BETWEEN ? AND ?
       ORDER BY purchase_date DESC`,
      [businessId, startDate, endDate]
    );
    return rows.map(row => this.mapRow(row));
  }

  async getTotalPurchases(businessId: string, startDate: string, endDate: string): Promise<number> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(total_amount), 0) as total
       FROM ${this.tableName}
       WHERE business_id = ? AND purchase_date BETWEEN ? AND ? AND status = 'completed'`,
      [businessId, startDate, endDate]
    );
    return row?.total ?? 0;
  }

  async getCashPurchases(businessId: string, startDate: string, endDate: string): Promise<number> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(p.paid_amount), 0) as total
       FROM ${this.tableName} p
       JOIN payments pay ON pay.reference_type = 'purchase' AND pay.reference_id = p.id
       WHERE p.business_id = ? AND p.purchase_date BETWEEN ? AND ? 
       AND p.status = 'completed' AND pay.payment_method = 'cash'`,
      [businessId, startDate, endDate]
    );
    return row?.total ?? 0;
  }
}

export class PurchaseItemRepository extends BaseRepository<PurchaseItem> {
  protected tableName = 'purchase_items';
  protected columns = ['id', 'business_id', 'purchase_id', 'product_id', 'quantity', 'unit_cost', 'total_cost', 'created_at', 'updated_at'];

  async findByPurchase(purchaseId: string, businessId: string): Promise<PurchaseItem[]> {
    return this.findAll(businessId, { where: { purchase_id: purchaseId } });
  }
}

export const purchaseRepository = new PurchaseRepository();
export const purchaseItemRepository = new PurchaseItemRepository();