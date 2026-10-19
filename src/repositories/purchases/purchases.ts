import { BaseRepository } from '../base';
import { Purchase, PurchaseItem, PurchaseStatus } from '@/types';
import { buildPeriodWhere } from '@/utils/periodBounds';

export class PurchaseRepository extends BaseRepository<Purchase> {
  protected tableName = 'purchases';
  protected columns = [
    'id', 'business_id', 'supplier_id', 'session_id', 'reference_number', 'total_amount',
    'paid_amount', 'status', 'purchase_date', 'notes', 'created_by', 'device_id', 'sync_status', 'created_at', 'updated_at'
  ];

  async findBySupplier(supplierId: string, businessId: string): Promise<Purchase[]> {
    return this.findAll(businessId, {
      where: { supplier_id: supplierId },
      limit: 10000,
      orderBy: 'purchase_date',
      orderDirection: 'DESC',
    });
  }

  async findByStatus(businessId: string, status: PurchaseStatus): Promise<Purchase[]> {
    return this.findAll(businessId, { where: { status } });
  }

  async findByDateRange(businessId: string, startDate: string, endDate: string): Promise<Purchase[]> {
    const db = await this.getDb();
    const period = buildPeriodWhere('purchase_date', 'created_at', startDate, endDate);
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM ${this.tableName}
       WHERE business_id = ? AND ${period.clause}
       ORDER BY purchase_date DESC`,
      [businessId, ...period.params]
    );
    return rows.map(row => this.mapRow(row));
  }

  async findBySession(businessId: string, sessionId: string): Promise<Purchase[]> {
    return this.findAll(businessId, {
      where: { session_id: sessionId },
      limit: 10000,
      orderBy: 'created_at',
      orderDirection: 'DESC',
    });
  }

  async getTotalPurchases(businessId: string, startDate: string, endDate: string): Promise<number> {
    const db = await this.getDb();
    const period = buildPeriodWhere('purchase_date', 'created_at', startDate, endDate);
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(total_amount), 0) as total
       FROM ${this.tableName}
       WHERE business_id = ? AND status != 'cancelled' AND ${period.clause}`,
      [businessId, ...period.params]
    );
    return row?.total ?? 0;
  }

  async getCashPurchases(businessId: string, startDate: string, endDate: string): Promise<number> {
    const db = await this.getDb();
    const period = buildPeriodWhere('p.purchase_date', 'p.created_at', startDate, endDate);
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(pay.amount), 0) as total
       FROM ${this.tableName} p
       JOIN payments pay ON pay.reference_type = 'purchase' AND pay.reference_id = p.id AND pay.business_id = p.business_id
       WHERE p.business_id = ? AND ${period.clause}
       AND p.status != 'cancelled'
       AND pay.type = 'purchase_payment'
       AND pay.payment_method = 'cash'`,
      [businessId, ...period.params]
    );
    return row?.total ?? 0;
  }

  async getCashPurchasesForSession(businessId: string, sessionId: string): Promise<number> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(pay.amount), 0) as total
       FROM ${this.tableName} p
       JOIN payments pay ON pay.reference_type = 'purchase' AND pay.reference_id = p.id AND pay.business_id = p.business_id
       WHERE p.business_id = ? AND p.session_id = ?
       AND p.status != 'cancelled'
       AND pay.type = 'purchase_payment'
       AND pay.payment_method = 'cash'`,
      [businessId, sessionId]
    );
    return row?.total ?? 0;
  }

  async getSupplierPosition(
    supplierId: string,
    businessId: string
  ): Promise<{ owed: number; paid: number; outstanding: number }> {
    const db = await this.getDb();
    const purchases = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(total_amount), 0) as total
       FROM purchases
       WHERE business_id = ? AND supplier_id = ? AND status != 'cancelled'`,
      [businessId, supplierId]
    );
    const checkout = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(pay.amount), 0) as total
       FROM payments pay
       JOIN purchases p ON p.id = pay.reference_id AND p.business_id = pay.business_id
       WHERE pay.business_id = ? AND pay.type = 'purchase_payment' AND pay.reference_type = 'purchase'
         AND p.supplier_id = ? AND p.status != 'cancelled'`,
      [businessId, supplierId]
    );
    const later = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM payments
       WHERE business_id = ? AND type = 'supplier_payment' AND party_id = ?`,
      [businessId, supplierId]
    );
    const purchaseTotal = purchases?.total ?? 0;
    const checkoutPaid = checkout?.total ?? 0;
    const laterPaid = later?.total ?? 0;
    const owed = purchaseTotal - checkoutPaid;
    return { owed, paid: laterPaid, outstanding: owed - laterPaid };
  }

  async getTotalOutstanding(businessId: string): Promise<number> {
    const db = await this.getDb();
    const purchases = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(total_amount), 0) as total
       FROM purchases
       WHERE business_id = ? AND status != 'cancelled'`,
      [businessId]
    );
    const checkout = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(pay.amount), 0) as total
       FROM payments pay
       JOIN purchases p ON p.id = pay.reference_id AND p.business_id = pay.business_id
       WHERE pay.business_id = ? AND pay.type = 'purchase_payment' AND pay.reference_type = 'purchase'
         AND p.status != 'cancelled'`,
      [businessId]
    );
    const later = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM payments
       WHERE business_id = ? AND type = 'supplier_payment'`,
      [businessId]
    );
    return (purchases?.total ?? 0) - (checkout?.total ?? 0) - (later?.total ?? 0);
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