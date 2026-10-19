import { 
  Sale, SaleItem, Purchase, PurchaseItem, Expense, Payment, DailyClosing,
  StockMovement, Product, StockMovementType, PaymentMethod, PaymentType
} from '@/types';
import {
  calculateSaleSubtotal,
  calculateSaleTotal,
  calculateWeightedAverageCost,
  calculateCOGS,
  calculateGrossProfit,
  calculateGrossMargin,
  calculateNetProfit,
  salesRevenue,
  calculateExpectedCash,
  calculateCashVariance,
  roundToMinorUnits,
  calculateAverageTransactionValue,
} from './calculations';
import { emptyMethods, assembleBooks, PeriodBooks, MethodTotals } from './books';
import { productRepository, stockMovementRepository } from '@/repositories/products/products';
import { purchaseRepository } from '@/repositories/purchases/purchases';
import { saleRepository } from '@/repositories/sales/sales';
import { expenseRepository } from '@/repositories/expenses/expenses';
import { paymentRepository } from '@/repositories/payments/payments';
import { dailyClosingRepository } from '@/repositories/reports/dailyClosing';

export class FinancialService {
  async calculateSaleTotals(
    items: Array<{ product_id: string; quantity: number; selling_price: number; discount_amount?: number; tax_amount?: number }>,
    businessId: string
  ): Promise<{
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    totalAmount: number;
    cogs: number;
    grossProfit: number;
    grossMargin: number;
    itemsWithCost: Array<{ product_id: string; quantity: number; selling_price: number; discount_amount?: number; tax_amount?: number; unit_cost: number }>;
  }> {
    const itemsWithCost = await Promise.all(
      items.map(async (item) => {
        const product = await productRepository.findById(item.product_id, businessId);
        const unitCost = product?.average_cost ?? 0;
        return { ...item, unit_cost: unitCost };
      })
    );

    const subtotal = calculateSaleSubtotal(itemsWithCost);
    const discountAmount = itemsWithCost.reduce((sum, item) => sum + (item.discount_amount ?? 0), 0);
    const taxAmount = itemsWithCost.reduce((sum, item) => sum + (item.tax_amount ?? 0), 0);
    const totalAmount = calculateSaleTotal(subtotal, discountAmount, taxAmount);
    const revenue = salesRevenue(totalAmount, taxAmount);
    const cogs = calculateCOGS(itemsWithCost);
    const grossProfit = calculateGrossProfit(revenue, cogs);
    const grossMargin = calculateGrossMargin(grossProfit, revenue);

    return {
      subtotal,
      discountAmount,
      taxAmount,
      totalAmount,
      cogs,
      grossProfit,
      grossMargin,
      itemsWithCost,
    };
  }

  async calculatePurchaseTotals(
    items: Array<{ product_id: string; quantity: number; unit_cost: number }>
  ): Promise<{ totalAmount: number; itemsWithTotal: Array<{ product_id: string; quantity: number; unit_cost: number; total_cost: number }> }> {
    const itemsWithTotal = items.map(item => ({
      ...item,
      total_cost: roundToMinorUnits(item.quantity * item.unit_cost),
    }));

    const totalAmount = itemsWithTotal.reduce((sum, item) => sum + item.total_cost, 0);

    return { totalAmount, itemsWithTotal };
  }

  async updateProductAverageCost(
    productId: string,
    businessId: string,
    purchaseQuantity: number,
    purchaseCost: number
  ): Promise<number> {
    const product = await productRepository.findById(productId, businessId);
    if (!product) throw new Error('Product not found');

    const stockOnHand = await productRepository.getStockBalance(productId, businessId);
    const quantityBeforePurchase = stockOnHand - purchaseQuantity;
    const newAverageCost = calculateWeightedAverageCost(
      quantityBeforePurchase,
      product.average_cost,
      purchaseQuantity,
      purchaseCost
    );

    await productRepository.updateAverageCost(productId, businessId, newAverageCost);
    return newAverageCost;
  }

  async calculateDailyFinancials(
    businessId: string,
    businessDate: string,
    endDate?: string
  ): Promise<{
    totalSales: number;
    cogs: number;
    grossProfit: number;
    expenses: number;
    netProfit: number;
    cashSales: number;
    customerCashPayments: number;
    otherCashIncome: number;
    cashPurchases: number;
    cashExpenses: number;
    supplierCashPayments: number;
    withdrawals: number;
  }> {
    const startOfDay = businessDate.slice(0, 10);
    const endOfDay = (endDate ?? businessDate).slice(0, 10);

    const [
      totalSales,
      tax,
      cogs,
      expenses,
      inventoryLoss,
      cashSales,
      customerCashPayments,
      otherCashIncome,
      cashPurchases,
      cashExpenses,
      supplierCashPayments,
      withdrawals,
    ] = await Promise.all([
      saleRepository.getTotalSales(businessId, startOfDay, endOfDay),
      saleRepository.getTotalTax(businessId, startOfDay, endOfDay),
      this.calculateCOGSForPeriod(businessId, startOfDay, endOfDay),
      expenseRepository.getTotalExpenses(businessId, startOfDay, endOfDay),
      stockMovementRepository.getInventoryLoss(businessId, startOfDay, endOfDay),
      saleRepository.getCashSales(businessId, startOfDay, endOfDay),
      paymentRepository.getTotalByTypeAndMethod(businessId, startOfDay, endOfDay, 'customer_payment', 'cash'),
      paymentRepository.getTotalByTypeAndMethod(businessId, startOfDay, endOfDay, 'other_income', 'cash'),
      purchaseRepository.getCashPurchases(businessId, startOfDay, endOfDay),
      expenseRepository.getCashExpenses(businessId, startOfDay, endOfDay),
      paymentRepository.getTotalByTypeAndMethod(businessId, startOfDay, endOfDay, 'supplier_payment', 'cash'),
      paymentRepository.getTotalByTypeAndMethod(businessId, startOfDay, endOfDay, 'withdrawal', 'cash'),
    ]);

    const revenue = salesRevenue(totalSales, tax);
    const grossProfit = calculateGrossProfit(revenue, cogs);
    const netProfit = calculateNetProfit(grossProfit, expenses, inventoryLoss);

    return {
      totalSales,
      cogs,
      grossProfit,
      expenses,
      netProfit,
      cashSales,
      customerCashPayments,
      otherCashIncome,
      cashPurchases,
      cashExpenses,
      supplierCashPayments,
      withdrawals,
    };
  }

  /**
   * Trading-session books: every row stamped with session_id.
   * Spans midnight / multi-day sessions without mixing calendar-date reports.
   */
  async calculateSessionFinancials(
    businessId: string,
    sessionId: string
  ): Promise<{
    totalSales: number;
    cogs: number;
    grossProfit: number;
    expenses: number;
    netProfit: number;
    cashSales: number;
    customerCashPayments: number;
    otherCashIncome: number;
    cashPurchases: number;
    cashExpenses: number;
    supplierCashPayments: number;
    withdrawals: number;
  }> {
    const [
      totalSales,
      tax,
      salesWithItems,
      expenses,
      inventoryLoss,
      cashSales,
      customerCashPayments,
      otherCashIncome,
      cashPurchases,
      cashExpenses,
      supplierCashPayments,
      withdrawals,
    ] = await Promise.all([
      saleRepository.getTotalSalesForSession(businessId, sessionId),
      saleRepository.getTotalTaxForSession(businessId, sessionId),
      saleRepository.getSalesWithItemsForSession(businessId, sessionId),
      expenseRepository.getTotalExpensesForSession(businessId, sessionId),
      stockMovementRepository.getInventoryLossForSession(businessId, sessionId),
      saleRepository.getCashSalesForSession(businessId, sessionId),
      paymentRepository.getTotalByTypeAndMethodForSession(businessId, sessionId, 'customer_payment', 'cash'),
      paymentRepository.getTotalByTypeAndMethodForSession(businessId, sessionId, 'other_income', 'cash'),
      purchaseRepository.getCashPurchasesForSession(businessId, sessionId),
      expenseRepository.getCashExpensesForSession(businessId, sessionId),
      paymentRepository.getTotalByTypeAndMethodForSession(businessId, sessionId, 'supplier_payment', 'cash'),
      paymentRepository.getTotalByTypeAndMethodForSession(businessId, sessionId, 'withdrawal', 'cash'),
    ]);

    let cogs = 0;
    for (const sale of salesWithItems) {
      if (sale.voided) continue;
      for (const item of sale.items ?? []) {
        cogs += (item.quantity ?? 0) * (item.unit_cost ?? 0);
      }
    }

    const revenue = salesRevenue(totalSales, tax);
    const grossProfit = calculateGrossProfit(revenue, cogs);
    const netProfit = calculateNetProfit(grossProfit, expenses, inventoryLoss);

    return {
      totalSales,
      cogs,
      grossProfit,
      expenses,
      netProfit,
      cashSales,
      customerCashPayments,
      otherCashIncome,
      cashPurchases,
      cashExpenses,
      supplierCashPayments,
      withdrawals,
    };
  }

  async calculateCOGSForPeriod(businessId: string, startDate: string, endDate: string): Promise<number> {
    const sales = await saleRepository.getSalesWithItems(businessId, startDate, endDate);
    let totalCOGS = 0;
    
    for (const sale of sales) {
    if (sale.voided) continue;
    const items = sale?.items;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!item) continue;
      totalCOGS += (item.quantity ?? 0) * (item.unit_cost ?? 0);
    }
  }
    
    return totalCOGS;
  }

  async calculateCashReconciliation(
    businessId: string,
    businessDate: string,
    openingCash: number,
    actualCash: number,
    endDate?: string
  ): Promise<{
    expectedCash: number;
    cashVariance: number;
    breakdown: {
      cashSales: number;
      customerCashPayments: number;
      otherCashIncome: number;
      cashPurchases: number;
      cashExpenses: number;
      supplierCashPayments: number;
      withdrawals: number;
    };
  }> {
    const startOfDay = businessDate.slice(0, 10);
    const endOfDay = (endDate ?? businessDate).slice(0, 10);

    const [
      cashSales,
      customerCashPayments,
      otherCashIncome,
      cashPurchases,
      cashExpenses,
      supplierCashPayments,
      withdrawals,
    ] = await Promise.all([
      saleRepository.getCashSales(businessId, startOfDay, endOfDay),
      paymentRepository.getTotalByTypeAndMethod(businessId, startOfDay, endOfDay, 'customer_payment', 'cash'),
      paymentRepository.getTotalByTypeAndMethod(businessId, startOfDay, endOfDay, 'other_income', 'cash'),
      purchaseRepository.getCashPurchases(businessId, startOfDay, endOfDay),
      expenseRepository.getCashExpenses(businessId, startOfDay, endOfDay),
      paymentRepository.getTotalByTypeAndMethod(businessId, startOfDay, endOfDay, 'supplier_payment', 'cash'),
      paymentRepository.getTotalByTypeAndMethod(businessId, startOfDay, endOfDay, 'withdrawal', 'cash'),
    ]);

    const expectedCash = calculateExpectedCash(
      openingCash,
      cashSales,
      customerCashPayments,
      otherCashIncome,
      cashPurchases,
      cashExpenses,
      supplierCashPayments,
      withdrawals
    );

    const cashVariance = calculateCashVariance(actualCash, expectedCash);

    return {
      expectedCash,
      cashVariance,
      breakdown: {
        cashSales,
        customerCashPayments,
        otherCashIncome,
        cashPurchases,
        cashExpenses,
        supplierCashPayments,
        withdrawals,
      },
    };
  }

  async calculateCashReconciliationForSession(
    businessId: string,
    sessionId: string,
    openingCash: number,
    actualCash: number
  ): Promise<{
    expectedCash: number;
    cashVariance: number;
    breakdown: {
      cashSales: number;
      customerCashPayments: number;
      otherCashIncome: number;
      cashPurchases: number;
      cashExpenses: number;
      supplierCashPayments: number;
      withdrawals: number;
    };
  }> {
    const [
      cashSales,
      customerCashPayments,
      otherCashIncome,
      cashPurchases,
      cashExpenses,
      supplierCashPayments,
      withdrawals,
    ] = await Promise.all([
      saleRepository.getCashSalesForSession(businessId, sessionId),
      paymentRepository.getTotalByTypeAndMethodForSession(businessId, sessionId, 'customer_payment', 'cash'),
      paymentRepository.getTotalByTypeAndMethodForSession(businessId, sessionId, 'other_income', 'cash'),
      purchaseRepository.getCashPurchasesForSession(businessId, sessionId),
      expenseRepository.getCashExpensesForSession(businessId, sessionId),
      paymentRepository.getTotalByTypeAndMethodForSession(businessId, sessionId, 'supplier_payment', 'cash'),
      paymentRepository.getTotalByTypeAndMethodForSession(businessId, sessionId, 'withdrawal', 'cash'),
    ]);

    const expectedCash = calculateExpectedCash(
      openingCash,
      cashSales,
      customerCashPayments,
      otherCashIncome,
      cashPurchases,
      cashExpenses,
      supplierCashPayments,
      withdrawals
    );

    return {
      expectedCash,
      cashVariance: calculateCashVariance(actualCash, expectedCash),
      breakdown: {
        cashSales,
        customerCashPayments,
        otherCashIncome,
        cashPurchases,
        cashExpenses,
        supplierCashPayments,
        withdrawals,
      },
    };
  }

  async generateSalesReport(
    businessId: string,
    startDate: string,
    endDate: string
  ): Promise<{
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
    topProducts: Array<{
      productId: string;
      productName: string;
      quantitySold: number;
      totalSales: number;
      totalProfit: number;
      margin: number;
    }>;
    paymentBreakdown: Array<{ payment_method: PaymentMethod; amount: number; count: number }>;
  }> {
    const [
      totalSales,
      tax,
      totalCOGS,
      totalExpenses,
      inventoryLoss,
      itemsSold,
      transactionCount,
      stockValue,
      topProducts,
      paymentBreakdown,
    ] = await Promise.all([
      saleRepository.getTotalSales(businessId, startDate, endDate),
      saleRepository.getTotalTax(businessId, startDate, endDate),
      this.calculateCOGSForPeriod(businessId, startDate, endDate),
      expenseRepository.getTotalExpenses(businessId, startDate, endDate),
      stockMovementRepository.getInventoryLoss(businessId, startDate, endDate),
      this.getTotalItemsSold(businessId, startDate, endDate),
      saleRepository.countInPeriod(businessId, startDate, endDate),
      productRepository.getStockValue(businessId),
      this.getTopProducts(businessId, startDate, endDate),
      paymentRepository.getPaymentBreakdown(businessId, startDate, endDate),
    ]);

    const revenue = salesRevenue(totalSales, tax);
    const grossProfit = calculateGrossProfit(revenue, totalCOGS);
    const grossMargin = calculateGrossMargin(grossProfit, revenue);
    const netProfit = calculateNetProfit(grossProfit, totalExpenses, inventoryLoss);
    const averageTransactionValue = calculateAverageTransactionValue(totalSales, transactionCount);

    return {
      totalSales,
      totalCOGS,
      grossProfit,
      grossMargin,
      netProfit,
      totalExpenses,
      itemsSold,
      transactionCount,
      averageTransactionValue,
      stockValue,
      topProducts,
      paymentBreakdown,
    };
  }

  /**
   * Single authoritative period calculation. Every report, dashboard card and PDF
   * must derive its numbers from here so headline figures, charts and exports agree.
   *
   * Sales by payment method = money received AT CHECKOUT for sales in the period.
   * Collections = money received LATER for older credit sales. Never mixed.
   */
  async buildPeriodBooks(
    businessId: string,
    startDate: string,
    endDate: string,
    options?: { openingCash?: number; topLimit?: number; sessionId?: string | null }
  ): Promise<PeriodBooks> {
    if (options?.sessionId) {
      return this.buildSessionBooks(businessId, options.sessionId, options);
    }
    const start = startDate.slice(0, 10);
    const end = endDate.slice(0, 10);
    const [
      totalSales,
      tax,
      cogs,
      expenses,
      loss,
      itemsSold,
      transactionCount,
      checkout,
      sums,
      purchasesTotal,
      cashPurchases,
      cashExpenses,
      stockNow,
      positionAtEnd,
      topProducts,
    ] = await Promise.all([
      saleRepository.getTotalSales(businessId, start, end),
      saleRepository.getTotalTax(businessId, start, end),
      this.calculateCOGSForPeriod(businessId, start, end),
      expenseRepository.getTotalExpenses(businessId, start, end),
      stockMovementRepository.getInventoryLossBreakdown(businessId, start, end),
      this.getTotalItemsSold(businessId, start, end),
      saleRepository.countInPeriod(businessId, start, end),
      saleRepository.getCheckoutSplit(businessId, start, end),
      paymentRepository.sumByTypeAndMethod(businessId, start, end),
      purchaseRepository.getTotalPurchases(businessId, start, end),
      purchaseRepository.getCashPurchases(businessId, start, end),
      expenseRepository.getCashExpenses(businessId, start, end),
      productRepository.getStockValue(businessId),
      productRepository.getPositionAsOf(businessId, end),
      this.getTopProducts(businessId, start, end, options?.topLimit ?? 5),
    ]);

    const byType = (type: string): MethodTotals => {
      const out = emptyMethods();
      for (const row of sums) {
        if (row.type !== type) continue;
        const v = row.total ?? 0;
        if (row.payment_method === 'cash') out.cash += v;
        else if (row.payment_method === 'mobile_money') out.mobileMoney += v;
        else if (row.payment_method === 'bank') out.bank += v;
      }
      return out;
    };
    const collections = byType('customer_payment');
    const otherIncome = byType('other_income');
    const supplierPayments = byType('supplier_payment');
    const withdrawalsRow = byType('withdrawal');

    const stockValueAtEnd = positionAtEnd.reduce((sum, p) => sum + p.value, 0);

    return assembleBooks({
      totalSales,
      tax,
      cogs,
      expenses,
      damagedValue: loss.damaged,
      adjustmentOutValue: loss.adjustmentOut,
      adjustmentInValue: loss.adjustmentIn,
      itemsSold,
      transactionCount,
      checkout: { cash: checkout.cash, mobileMoney: checkout.mobileMoney, bank: checkout.bank },
      creditSales: checkout.creditSales,
      collections,
      otherIncome,
      supplierPayments,
      cashPurchases,
      cashExpenses,
      withdrawals: withdrawalsRow.cash + withdrawalsRow.mobileMoney + withdrawalsRow.bank,
      openingCash: options?.openingCash ?? 0,
      topProducts: topProducts.map((p) => ({
        productId: p.productId,
        productName: p.productName,
        quantitySold: p.quantitySold,
        revenue: p.totalSales,
        cost: p.totalSales - p.totalProfit,
        grossProfit: p.totalProfit,
        margin: p.margin,
      })),
      stockValueNow: stockNow,
      stockValueAtEnd,
    });
  }

  /** Period books keyed by trading session (open→close), not calendar date. */
  async buildSessionBooks(
    businessId: string,
    sessionId: string,
    options?: { openingCash?: number; topLimit?: number }
  ): Promise<PeriodBooks> {
    const [
      totalSales,
      tax,
      salesWithItems,
      expenses,
      inventoryLoss,
      itemsSold,
      checkout,
      sums,
      cashPurchases,
      cashExpenses,
      stockNow,
      topProducts,
    ] = await Promise.all([
      saleRepository.getTotalSalesForSession(businessId, sessionId),
      saleRepository.getTotalTaxForSession(businessId, sessionId),
      saleRepository.getSalesWithItemsForSession(businessId, sessionId),
      expenseRepository.getTotalExpensesForSession(businessId, sessionId),
      stockMovementRepository.getInventoryLossForSession(businessId, sessionId),
      this.getTotalItemsSoldForSession(businessId, sessionId),
      saleRepository.getCheckoutSplitForSession(businessId, sessionId),
      paymentRepository.sumByTypeAndMethodForSession(businessId, sessionId),
      purchaseRepository.getCashPurchasesForSession(businessId, sessionId),
      expenseRepository.getCashExpensesForSession(businessId, sessionId),
      productRepository.getStockValue(businessId),
      this.getTopProducts(businessId, '2000-01-01', '2099-12-31', options?.topLimit ?? 5, {
        sessionId,
      }),
    ]);

    let cogs = 0;
    for (const sale of salesWithItems) {
      if (sale.voided) continue;
      for (const item of sale.items ?? []) {
        cogs += (item.quantity ?? 0) * (item.unit_cost ?? 0);
      }
    }

    const byType = (type: string): MethodTotals => {
      const out = emptyMethods();
      for (const row of sums) {
        if (row.type !== type) continue;
        const v = row.total ?? 0;
        if (row.payment_method === 'cash') out.cash += v;
        else if (row.payment_method === 'mobile_money') out.mobileMoney += v;
        else if (row.payment_method === 'bank') out.bank += v;
      }
      return out;
    };
    const collections = byType('customer_payment');
    const otherIncome = byType('other_income');
    const supplierPayments = byType('supplier_payment');
    const withdrawalsRow = byType('withdrawal');
    const transactionCount = salesWithItems.filter((s) => !s.voided).length;

    // Inventory loss is a net figure for the session; attribute to damaged for assembleBooks.
    return assembleBooks({
      totalSales,
      tax,
      cogs,
      expenses,
      damagedValue: Math.max(0, inventoryLoss),
      adjustmentOutValue: 0,
      adjustmentInValue: Math.max(0, -inventoryLoss),
      itemsSold,
      transactionCount,
      checkout: { cash: checkout.cash, mobileMoney: checkout.mobileMoney, bank: checkout.bank },
      creditSales: checkout.creditSales,
      collections,
      otherIncome,
      supplierPayments,
      cashPurchases,
      cashExpenses,
      withdrawals: withdrawalsRow.cash + withdrawalsRow.mobileMoney + withdrawalsRow.bank,
      openingCash: options?.openingCash ?? 0,
      topProducts,
      stockValueNow: stockNow,
      stockValueAtEnd: stockNow,
    });
  }

  async getBusinessHealth(
    businessId: string
  ): Promise<{
    openDay: boolean;
    pendingSync: number;
    failedSync: number;
    customerDebt: number;
    supplierDebt: number;
    lowStockCount: number;
    outOfStockCount: number;
  }> {
    const { syncRepository } = await import('@/repositories/sync');
    const [openDay, pending, failed, lowStock] = await Promise.all([
      dailyClosingRepository.findOpenDay(businessId),
      syncRepository.getPendingCount(businessId),
      syncRepository.getFailedCount(businessId),
      productRepository.findLowStock(businessId),
    ]);
    const [positions, supplierOutstanding] = await Promise.all([
      saleRepository.listCustomerPositions(businessId),
      purchaseRepository.getTotalOutstanding(businessId),
    ]);
    return {
      openDay: !!openDay,
      pendingSync: pending,
      failedSync: failed,
      customerDebt: positions.reduce((s, p) => s + Math.max(0, p.outstanding), 0),
      supplierDebt: Math.max(0, supplierOutstanding),
      lowStockCount: lowStock.length,
      outOfStockCount: lowStock.filter((p) => (p.current_stock ?? 0) <= 0).length,
    };
  }

  async getTotalItemsSold(businessId: string, startDate: string, endDate: string): Promise<number> {
    const sales = await saleRepository.getSalesWithItems(businessId, startDate, endDate);
    return sales.reduce((sum, sale) => {
      if (sale.voided) return sum;
      return sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0);
    }, 0);
  }

  async getTotalItemsSoldForSession(businessId: string, sessionId: string): Promise<number> {
    const sales = await saleRepository.getSalesWithItemsForSession(businessId, sessionId);
    return sales.reduce((sum, sale) => {
      if (sale.voided) return sum;
      return sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0);
    }, 0);
  }

  async getTopProducts(
    businessId: string,
    startDate: string,
    endDate: string,
    limit = 10,
    options?: { sessionId?: string | null }
  ): Promise<Array<{ productId: string; productName: string; quantitySold: number; totalSales: number; totalProfit: number; margin: number }>> {
    const db = await (await import('../../db/database')).getDatabase();
    const { buildSessionOrPeriodWhere } = await import('@/utils/periodBounds');
    const period = buildSessionOrPeriodWhere('s.session_id', 's.sale_date', 's.created_at', {
      sessionId: options?.sessionId,
      start: startDate,
      end: endDate,
    });
    const rows = await db.getAllAsync<{
      product_id: string;
      product_name: string;
      quantity_sold: number;
      total_sales: number;
      revenue: number;
      total_profit: number;
    }>(
      `SELECT 
        p.id as product_id,
        p.name as product_name,
        SUM(si.quantity) as quantity_sold,
        SUM(si.total_amount) as total_sales,
        SUM(si.total_amount - si.tax_amount) as revenue,
        SUM(si.total_amount - si.tax_amount - si.quantity * si.unit_cost) as total_profit
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       JOIN products p ON si.product_id = p.id
       WHERE si.business_id = ? AND s.voided = 0 AND ${period.clause}
       GROUP BY p.id, p.name
       ORDER BY total_sales DESC
       LIMIT ?`,
      [businessId, ...period.params, limit]
    );

    return rows.map(row => ({
      productId: row.product_id,
      productName: row.product_name,
      quantitySold: row.quantity_sold,
      totalSales: row.total_sales,
      totalProfit: row.total_profit,
      margin: row.revenue > 0 ? Math.round((row.total_profit / row.revenue) * 10000) / 100 : 0,
    }));
  }

  async getLowStockProducts(businessId: string): Promise<Array<{
    productId: string;
    productName: string;
    sku: string | null;
    currentStock: number;
    reorderLevel: number;
    stockValue: number;
    averageCost: number;
    sellingPrice: number;
    isLowStock: boolean;
  }>> {
    const products = await productRepository.findLowStock(businessId);
    
    return Promise.all(products.map(async (product) => {
      const currentStock = await productRepository.getStockBalance(product.id, businessId);
      return {
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        currentStock,
        reorderLevel: product.reorder_level,
        stockValue: currentStock * product.average_cost,
        averageCost: product.average_cost,
        sellingPrice: product.selling_price,
        isLowStock: currentStock <= product.reorder_level,
      };
    }));
  }
}

export const financialService = new FinancialService();
