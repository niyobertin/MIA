import { BaseRepository } from '../base';
import { WaiterTab, WaiterTabItem, WaiterTabStatus } from '@/types';
import { getDatabase } from '@/db/database';

export class WaiterTabRepository extends BaseRepository<WaiterTab> {
  protected tableName = 'waiter_tabs';
  protected columns = [
    'id', 'business_id', 'session_id', 'waiter_user_id', 'customer_id', 'sale_id',
    'status', 'paid_amount', 'notes', 'issued_by', 'device_id', 'sync_status', 'created_at', 'updated_at',
  ];

  protected mapRow(row: Record<string, unknown>): WaiterTab {
    return {
      ...(row as unknown as WaiterTab),
      paid_amount: Number(row.paid_amount ?? 0),
    };
  }

  async findByStatus(businessId: string, status: WaiterTabStatus | WaiterTabStatus[]): Promise<WaiterTab[]> {
    const db = await this.getDb();
    const statuses = Array.isArray(status) ? status : [status];
    const placeholders = statuses.map(() => '?').join(',');
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT t.*, u.name AS waiter_name
       FROM ${this.tableName} t
       LEFT JOIN users u ON u.id = t.waiter_user_id
       WHERE t.business_id = ? AND t.status IN (${placeholders})
       ORDER BY t.created_at DESC`,
      [businessId, ...statuses]
    );
    return rows.map((row) => this.mapRow(row));
  }

  /** Open tabs that must become debt when the session closes (unpaid / partially paid). */
  async findOpenForSession(businessId: string, sessionId: string): Promise<WaiterTab[]> {
    const db = await this.getDb();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT t.*, u.name AS waiter_name
       FROM ${this.tableName} t
       LEFT JOIN users u ON u.id = t.waiter_user_id
       WHERE t.business_id = ? AND t.session_id = ? AND t.status IN ('draft', 'partial')
       ORDER BY t.created_at ASC`,
      [businessId, sessionId]
    );
    return rows.map((row) => this.mapRow(row));
  }

  /** @deprecated use findOpenForSession */
  async findDraftsForSession(businessId: string, sessionId: string): Promise<WaiterTab[]> {
    return this.findOpenForSession(businessId, sessionId);
  }

  async findByIdWithMeta(id: string, businessId: string): Promise<WaiterTab | null> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<Record<string, unknown>>(
      `SELECT t.*, u.name AS waiter_name,
              COALESCE((
                SELECT SUM(i.quantity_outstanding * i.selling_price)
                FROM waiter_tab_items i
                WHERE i.tab_id = t.id AND i.business_id = t.business_id
              ), 0) AS total_amount
       FROM ${this.tableName} t
       LEFT JOIN users u ON u.id = t.waiter_user_id
       WHERE t.id = ? AND t.business_id = ?`,
      [id, businessId]
    );
    if (!row) return null;
    const tab = this.mapRow(row);
    const total = Number(row.total_amount ?? 0);
    tab.total_amount = total;
    tab.balance_due = Math.max(0, total - (tab.paid_amount ?? 0));
    return tab;
  }

  async findAllWithMeta(
    businessId: string,
    statuses?: WaiterTabStatus[]
  ): Promise<WaiterTab[]> {
    const db = await this.getDb();
    const statusList = statuses?.length
      ? statuses
      : (['draft', 'partial', 'debt', 'paid'] as WaiterTabStatus[]);
    const placeholders = statusList.map(() => '?').join(',');
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT t.*, u.name AS waiter_name,
              COALESCE((
                SELECT SUM(i.quantity_outstanding * i.selling_price)
                FROM waiter_tab_items i
                WHERE i.tab_id = t.id AND i.business_id = t.business_id
              ), 0) AS total_amount
       FROM ${this.tableName} t
       LEFT JOIN users u ON u.id = t.waiter_user_id
       WHERE t.business_id = ? AND t.status IN (${placeholders})
       ORDER BY
         CASE t.status
           WHEN 'draft' THEN 0
           WHEN 'partial' THEN 1
           WHEN 'debt' THEN 2
           ELSE 3
         END,
         t.created_at DESC`,
      [businessId, ...statusList]
    );
    return rows.map((row) => {
      const tab = this.mapRow(row);
      const total = Number(row.total_amount ?? 0);
      tab.total_amount = total;
      tab.balance_due = Math.max(0, total - (tab.paid_amount ?? 0));
      return tab;
    });
  }
}

export class WaiterTabItemRepository extends BaseRepository<WaiterTabItem> {
  protected tableName = 'waiter_tab_items';
  protected columns = [
    'id', 'business_id', 'tab_id', 'product_id', 'quantity', 'selling_price',
    'unit_cost', 'quantity_outstanding', 'created_at', 'updated_at',
  ];

  async findByTab(tabId: string, businessId: string): Promise<WaiterTabItem[]> {
    const db = await this.getDb();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT i.*, p.name AS product_name
       FROM ${this.tableName} i
       LEFT JOIN products p ON p.id = i.product_id
       WHERE i.tab_id = ? AND i.business_id = ?
       ORDER BY i.created_at ASC`,
      [tabId, businessId]
    );
    return rows.map((row) => this.mapRow(row));
  }

  async tabTotal(tabId: string, businessId: string): Promise<number> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(quantity_outstanding * selling_price), 0) AS total
       FROM ${this.tableName}
       WHERE tab_id = ? AND business_id = ?`,
      [tabId, businessId]
    );
    return row?.total ?? 0;
  }
}

export const waiterTabRepository = new WaiterTabRepository();
export const waiterTabItemRepository = new WaiterTabItemRepository();
