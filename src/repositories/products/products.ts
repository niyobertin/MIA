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

  async updateAverageCost(productId: string, businessId: string, newAverageCost: number): Promise<Product | null> {
    return this.update(productId, businessId, { average_cost: newAverageCost });
  }
}

export class StockMovementRepository extends BaseRepository<StockMovement> {
  protected tableName = 'stock_movements';
  protected columns = [
    'id', 'business_id', 'product_id', 'type', 'quantity', 'unit_cost',
    'reference_type', 'reference_id', 'occurred_at', 'created_by', 'device_id', 'sync_status', 'created_at', 'updated_at'
  ];

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