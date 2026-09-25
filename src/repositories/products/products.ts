import { BaseRepository } from '../base';
import { Product, Category, StockMovement, StockMovementType } from '@/types';
import { getDatabase } from '../../db/database';

export class CategoryRepository extends BaseRepository<Category> {
  protected tableName = 'categories';
  protected columns = ['id', 'business_id', 'name', 'description', 'active', 'created_at', 'updated_at'];

  async findActive(businessId: string): Promise<Category[]> {
    return this.findAll(businessId, { where: { active: 1 } });
  }
}

export class ProductRepository extends BaseRepository<Product> {
  protected tableName = 'products';
  protected columns = [
    'id', 'business_id', 'category_id', 'name', 'sku', 'barcode', 'unit',
    'selling_price', 'average_cost', 'reorder_level', 'track_inventory', 'active', 'created_at', 'updated_at'
  ];

  async findBySku(sku: string, businessId: string): Promise<Product | null> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<Record<string, unknown>>(
      `SELECT * FROM ${this.tableName} WHERE sku = ? AND business_id = ?`,
      [sku, businessId]
    );
    return row ? this.mapRow(row) : null;
  }

  async findByBarcode(barcode: string, businessId: string): Promise<Product | null> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<Record<string, unknown>>(
      `SELECT * FROM ${this.tableName} WHERE barcode = ? AND business_id = ?`,
      [barcode, businessId]
    );
    return row ? this.mapRow(row) : null;
  }

  async findActive(businessId: string): Promise<Product[]> {
    return this.findAll(businessId, { where: { active: 1 } });
  }

  async findAllWithStock(businessId: string, activeOnly = true): Promise<Product[]> {
    const db = await this.getDb();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT p.*,
        COALESCE(SUM(CASE WHEN sm.type IN ('opening', 'purchase', 'return_in', 'adjustment_in') THEN sm.quantity ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN sm.type IN ('sale', 'return_out', 'adjustment_out', 'damaged') THEN sm.quantity ELSE 0 END), 0) as current_stock
       FROM products p
       LEFT JOIN stock_movements sm ON p.id = sm.product_id AND sm.business_id = p.business_id
       WHERE p.business_id = ? ${activeOnly ? 'AND p.active = 1' : ''}
       GROUP BY p.id
       ORDER BY p.name ASC`,
      [businessId]
    );
    return rows.map(row => this.mapRow(row));
  }

  async findLowStock(businessId: string): Promise<Product[]> {
    const db = await this.getDb();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT p.*, 
        COALESCE(SUM(CASE WHEN sm.type IN ('opening', 'purchase', 'return_in', 'adjustment_in') THEN sm.quantity ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN sm.type IN ('sale', 'return_out', 'adjustment_out', 'damaged') THEN sm.quantity ELSE 0 END), 0) as current_stock
       FROM products p
       LEFT JOIN stock_movements sm ON p.id = sm.product_id AND sm.business_id = p.business_id
       WHERE p.business_id = ? AND p.active = 1 AND p.track_inventory = 1
       GROUP BY p.id
       HAVING current_stock <= p.reorder_level`,
      [businessId]
    );
    return rows.map(row => this.mapRow(row));
  }

  async getStockBalance(productId: string, businessId: string): Promise<number> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<{ balance: number }>(
      `SELECT 
        COALESCE(SUM(CASE WHEN type IN ('opening', 'purchase', 'return_in', 'adjustment_in') THEN quantity ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN type IN ('sale', 'return_out', 'adjustment_out', 'damaged') THEN quantity ELSE 0 END), 0) as balance
       FROM stock_movements
       WHERE product_id = ? AND business_id = ?`,
      [productId, businessId]
    );
    return row?.balance ?? 0;
  }

  async getStockValue(businessId: string): Promise<number> {
    const db = await this.getDb();
    const rows = await db.getAllAsync<{ product_id: string; average_cost: number; balance: number }>(
      `SELECT p.id as product_id, p.average_cost,
        COALESCE(SUM(CASE WHEN sm.type IN ('opening', 'purchase', 'return_in', 'adjustment_in') THEN sm.quantity ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN sm.type IN ('sale', 'return_out', 'adjustment_out', 'damaged') THEN sm.quantity ELSE 0 END), 0) as balance
       FROM products p
       LEFT JOIN stock_movements sm ON p.id = sm.product_id AND sm.business_id = p.business_id
       WHERE p.business_id = ? AND p.active = 1 AND p.track_inventory = 1
       GROUP BY p.id, p.average_cost`,
      [businessId]
    );
    
    return rows.reduce((sum, row) => sum + (row.average_cost * row.balance), 0);
  }

  async getTrackedBalances(businessId: string): Promise<Array<{
    product_id: string;
    name: string;
    unit: string;
    average_cost: number;
    balance: number;
  }>> {
    const db = await this.getDb();
    return db.getAllAsync(
      `SELECT p.id as product_id, p.name, p.unit, p.average_cost,
        COALESCE(SUM(CASE WHEN sm.type IN ('opening', 'purchase', 'return_in', 'adjustment_in') THEN sm.quantity ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN sm.type IN ('sale', 'return_out', 'adjustment_out', 'damaged') THEN sm.quantity ELSE 0 END), 0) as balance
       FROM products p
       LEFT JOIN stock_movements sm ON p.id = sm.product_id AND sm.business_id = p.business_id
       WHERE p.business_id = ? AND p.active = 1 AND p.track_inventory = 1
       GROUP BY p.id, p.name, p.unit, p.average_cost
       ORDER BY p.name ASC`,
      [businessId]
    );
  }

  async getStockSnapshot(businessId: string): Promise<{ quantity: number; value: number }> {
    const db = await this.getDb();
    const rows = await db.getAllAsync<{ average_cost: number; balance: number }>(
      `SELECT p.average_cost,
        COALESCE(SUM(CASE WHEN sm.type IN ('opening', 'purchase', 'return_in', 'adjustment_in') THEN sm.quantity ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN sm.type IN ('sale', 'return_out', 'adjustment_out', 'damaged') THEN sm.quantity ELSE 0 END), 0) as balance
       FROM products p
       LEFT JOIN stock_movements sm ON p.id = sm.product_id AND sm.business_id = p.business_id
       WHERE p.business_id = ? AND p.active = 1 AND p.track_inventory = 1
       GROUP BY p.id, p.average_cost`,
      [businessId]
    );

    return rows.reduce(
      (acc, row) => ({
        quantity: acc.quantity + row.balance,
        value: acc.value + row.average_cost * row.balance,
      }),
      { quantity: 0, value: 0 }
    );
  }

  async searchProducts(businessId: string, query: string, limit = 20): Promise<Product[]> {
    const db = await this.getDb();
    const searchTerm = `%${query}%`;
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM ${this.tableName}
       WHERE business_id = ? AND active = 1
       AND (name LIKE ? OR sku LIKE ? OR barcode LIKE ?)
       ORDER BY name ASC
       LIMIT ?`,
      [businessId, searchTerm, searchTerm, searchTerm, limit]
    );
    return rows.map(row => this.mapRow(row));
  }

  async getNetMovementForDate(
    businessId: string,
    businessDate: string
  ): Promise<{ quantity: number; value: number }> {
    const db = await this.getDb();
    const day = businessDate.slice(0, 10);
    const row = await db.getFirstAsync<{ quantity: number; value: number }>(
      `SELECT
         COALESCE(SUM(CASE
           WHEN type IN ('opening', 'purchase', 'return_in', 'adjustment_in') THEN quantity
           WHEN type IN ('sale', 'return_out', 'adjustment_out', 'damaged') THEN -quantity
           ELSE 0 END), 0) as quantity,
         COALESCE(SUM(CASE
           WHEN type IN ('opening', 'purchase', 'return_in', 'adjustment_in') THEN quantity * unit_cost
           WHEN type IN ('sale', 'return_out', 'adjustment_out', 'damaged') THEN -(quantity * unit_cost)
           ELSE 0 END), 0) as value
       FROM stock_movements
       WHERE business_id = ? AND substr(occurred_at, 1, 10) = ?`,
      [businessId, day]
    );
    return { quantity: row?.quantity ?? 0, value: row?.value ?? 0 };
  }

  async updateAverageCost(productId: string, businessId: string, newAverageCost: number): Promise<Product | null> {
    return this.update(productId, businessId, { average_cost: newAverageCost });
  }
}

export class StockMovementRepository extends BaseRepository<StockMovement> {
  protected tableName = 'stock_movements';
  protected columns = [
    'id', 'business_id', 'product_id', 'type', 'quantity', 'unit_cost',
    'reference_type', 'reference_id', 'occurred_at', 'created_by', 'device_id',
    'previous_quantity', 'new_quantity', 'reason', 'reversal_of',
    'sync_status', 'created_at', 'updated_at'
  ];

  async update(id: string, businessId: string, updates: Partial<Omit<StockMovement, 'id' | 'business_id' | 'created_at'>>): Promise<StockMovement | null> {
    const keys = Object.keys(updates);
    const allowed = keys.every((key) => key === 'sync_status' || key === 'updated_at');
    if (!allowed) throw new Error('HISTORY_LOCKED');
    return super.update(id, businessId, updates);
  }

  async delete(): Promise<boolean> {
    throw new Error('HISTORY_LOCKED');
  }

  async search(businessId: string, filters: {
    startDate?: string;
    endDate?: string;
    productId?: string;
    type?: string;
    userId?: string;
    quantity?: number;
    limit?: number;
  }): Promise<Array<StockMovement & { product_name: string; user_name: string | null }>> {
    const db = await this.getDb();
    const clauses = ['sm.business_id = ?'];
    const params: unknown[] = [businessId];
    if (filters.startDate) {
      clauses.push('substr(sm.occurred_at, 1, 10) >= ?');
      params.push(filters.startDate.slice(0, 10));
    }
    if (filters.endDate) {
      clauses.push('substr(sm.occurred_at, 1, 10) <= ?');
      params.push(filters.endDate.slice(0, 10));
    }
    if (filters.productId) {
      clauses.push('sm.product_id = ?');
      params.push(filters.productId);
    }
    if (filters.type) {
      clauses.push('sm.type = ?');
      params.push(filters.type);
    }
    if (filters.userId) {
      clauses.push('sm.created_by = ?');
      params.push(filters.userId);
    }
    if (filters.quantity != null && Number.isFinite(filters.quantity)) {
      clauses.push('sm.quantity = ?');
      params.push(filters.quantity);
    }
    params.push(filters.limit ?? 200);
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT sm.*, p.name as product_name, u.name as user_name
       FROM stock_movements sm
       JOIN products p ON p.id = sm.product_id
       LEFT JOIN users u ON u.id = sm.created_by
       WHERE ${clauses.join(' AND ')}
       ORDER BY sm.occurred_at DESC
       LIMIT ?`,
      params as (string | number | null)[]
    );
    return rows.map((row) => this.mapRow(row)) as Array<StockMovement & { product_name: string; user_name: string | null }>;
  }

  async getInventoryLoss(businessId: string, startDate: string, endDate: string): Promise<number> {
    const db = await this.getDb();
    const { buildPeriodWhere } = await import('@/utils/periodBounds');
    const period = buildPeriodWhere('occurred_at', 'occurred_at', startDate, endDate);
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT
         COALESCE(SUM(CASE WHEN type IN ('damaged', 'adjustment_out') THEN quantity * unit_cost ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN type = 'adjustment_in' THEN quantity * unit_cost ELSE 0 END), 0) as total
       FROM ${this.tableName}
       WHERE business_id = ? AND ${period.clause}`,
      [businessId, ...period.params]
    );
    return row?.total ?? 0;
  }

  async findByProduct(productId: string, businessId: string, limit = 100): Promise<StockMovement[]> {
    return this.findAll(businessId, {
      where: { product_id: productId },
      limit,
      orderBy: 'occurred_at',
      orderDirection: 'DESC',
    });
  }

  async findByReference(referenceType: string, referenceId: string, businessId: string): Promise<StockMovement[]> {
    const db = await this.getDb();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM ${this.tableName}
       WHERE business_id = ? AND reference_type = ? AND reference_id = ?
       ORDER BY occurred_at ASC`,
      [businessId, referenceType, referenceId]
    );
    return rows.map(row => this.mapRow(row));
  }

  async getStockInTotal(productId: string, businessId: string): Promise<number> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(quantity), 0) as total
       FROM ${this.tableName}
       WHERE product_id = ? AND business_id = ? AND type IN ('opening', 'purchase', 'return_in', 'adjustment_in')`,
      [productId, businessId]
    );
    return row?.total ?? 0;
  }

  async getStockOutTotal(productId: string, businessId: string): Promise<number> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(quantity), 0) as total
       FROM ${this.tableName}
       WHERE product_id = ? AND business_id = ? AND type IN ('sale', 'return_out', 'adjustment_out', 'damaged')`,
      [productId, businessId]
    );
    return row?.total ?? 0;
  }
}

export const categoryRepository = new CategoryRepository();
export const productRepository = new ProductRepository();
export const stockMovementRepository = new StockMovementRepository();