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
  calculateExpectedCash,
  calculateCashVariance,
  roundToMinorUnits,
  calculateAverageTransactionValue,
} from './calculations';
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
    const cogs = calculateCOGS(itemsWithCost);
    const grossProfit = calculateGrossProfit(totalAmount, cogs);
    const grossMargin = calculateGrossMargin(grossProfit, totalAmount);

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

    const currentStock = await productRepository.getStockBalance(productId, businessId);
    const newAverageCost = calculateWeightedAverageCost(
      currentStock,
      product.average_cost,
      purchaseQuantity,
      purchaseCost
    );

    await productRepository.updateAverageCost(productId, businessId, newAverageCost);
    return newAverageCost;
  }

  async calculateDailyFinancials(businessId: string, businessDate: string): Promise<{
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
    // Date columns are stored as YYYY-MM-DD, so compare on date-only bounds.
    const day = businessDate.slice(0, 10);
    const startOfDay = day;
    const endOfDay = day;

    const [
      totalSales,
      cogs,
      expenses,
      cashSales,
      customerCashPayments,
      otherCashIncome,
      cashPurchases,
      cashExpenses,
      supplierCashPayments,
      withdrawals,
    ] = await Promise.all([
      saleRepository.getTotalSales(businessId, startOfDay, endOfDay),
      this.calculateCOGSForPeriod(businessId, startOfDay, endOfDay),
      expenseRepository.getTotalExpenses(businessId, startOfDay, endOfDay),
      saleRepository.getCashSales(businessId, startOfDay, endOfDay),
      paymentRepository.getTotalByTypeAndMethod(businessId, startOfDay, endOfDay, 'customer_payment', 'cash'),
      paymentRepository.getTotalByTypeAndMethod(businessId, startOfDay, endOfDay, 'other_income', 'cash'),
      purchaseRepository.getCashPurchases(businessId, startOfDay, endOfDay),
      expenseRepository.getCashExpenses(businessId, startOfDay, endOfDay),
      paymentRepository.getTotalByTypeAndMethod(businessId, startOfDay, endOfDay, 'supplier_payment', 'cash'),
      paymentRepository.getTotalByTypeAndMethod(businessId, startOfDay, endOfDay, 'withdrawal', 'cash'),
    ]);

    const grossProfit = calculateGrossProfit(totalSales, cogs);
    const netProfit = calculateNetProfit(grossProfit, expenses);

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
      for (const item of sale.items) {
        totalCOGS += item.quantity * item.unit_cost;
      }
    }
    
    return totalCOGS;
  }

  async calculateCashReconciliation(
    businessId: string,
    businessDate: string,
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
    // Date columns are stored as YYYY-MM-DD, so compare on date-only bounds.
    const day = businessDate.slice(0, 10);
    const startOfDay = day;
    const endOfDay = day;

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
      totalCOGS,
      totalExpenses,
      itemsSold,
      transactionCount,
      stockValue,
      topProducts,
      paymentBreakdown,
    ] = await Promise.all([
      saleRepository.getTotalSales(businessId, startDate, endDate),
      this.calculateCOGSForPeriod(businessId, startDate, endDate),
      expenseRepository.getTotalExpenses(businessId, startDate, endDate),
      this.getTotalItemsSold(businessId, startDate, endDate),
      saleRepository.count(businessId, {}),
      productRepository.getStockValue(businessId),
      this.getTopProducts(businessId, startDate, endDate),
      paymentRepository.getPaymentBreakdown(businessId, startDate, endDate),
    ]);

    const grossProfit = calculateGrossProfit(totalSales, totalCOGS);
    const grossMargin = calculateGrossMargin(grossProfit, totalSales);
    const netProfit = calculateNetProfit(grossProfit, totalExpenses);
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

  async getTotalItemsSold(businessId: string, startDate: string, endDate: string): Promise<number> {
    const sales = await saleRepository.getSalesWithItems(businessId, startDate, endDate);
    return sales.reduce((sum, sale) => sum + sale.items.reduce((s, item) => s + item.quantity, 0), 0);
  }

  async getTopProducts(
    businessId: string,
    startDate: string,
    endDate: string,
    limit = 10
  ): Promise<Array<{ productId: string; productName: string; quantitySold: number; totalSales: number; totalProfit: number; margin: number }>> {
    const db = await (await import('../../db/database')).getDatabase();
    const { buildPeriodWhere } = await import('@/utils/periodBounds');
    const period = buildPeriodWhere('s.sale_date', 's.created_at', startDate, endDate);
    const rows = await db.getAllAsync<{
      product_id: string;
      product_name: string;
      quantity_sold: number;
      total_sales: number;
      total_profit: number;
    }>(
      `SELECT 
        p.id as product_id,
        p.name as product_name,
        SUM(si.quantity) as quantity_sold,
        SUM(si.total_amount) as total_sales,
        SUM(si.quantity * (si.selling_price - si.unit_cost)) as total_profit
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       JOIN products p ON si.product_id = p.id
       WHERE si.business_id = ? AND ${period.clause}
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
      margin: row.total_sales > 0 ? Math.round((row.total_profit / row.total_sales) * 10000) / 100 : 0,
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
