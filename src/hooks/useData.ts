import { generateUUID } from '@/utils/uuid';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { productRepository, categoryRepository, stockMovementRepository } from '@/repositories/products/products';
import { supplierRepository } from '@/repositories/purchases/suppliers';
import { customerRepository } from '@/repositories/sales/customers';
import { purchaseRepository, purchaseItemRepository } from '@/repositories/purchases/purchases';
import { saleRepository, saleItemRepository } from '@/repositories/sales/sales';
import { expenseRepository } from '@/repositories/expenses/expenses';
import { paymentRepository } from '@/repositories/payments/payments';
import { dailyClosingRepository } from '@/repositories/reports/dailyClosing';
import { financialService } from '@/services/financial';
import { queueSync } from '@/services/sync/queue';
import { Product, Category, Supplier, Customer, Purchase, Sale, Expense, Payment, PaymentMethod, DailyClosing, StockMovement } from '@/types';

const getBusinessId = () => useAuthStore.getState().business?.id ?? '';
const getUserId = () => useAuthStore.getState().user?.id ?? '';
const getDeviceId = () => 'local-device';

function requireAuthContext() {
  const businessId = getBusinessId();
  const userId = getUserId();
  if (!businessId) throw new Error('No active business');
  if (!userId) throw new Error('No logged-in user');
  return { businessId, userId, deviceId: getDeviceId() };
}

export function useProducts(options?: { active?: boolean; search?: string }) {
  const businessId = getBusinessId();
  return useQuery({
    queryKey: ['products', businessId, options],
    queryFn: async () => {
      if (options?.search) {
        return productRepository.searchProducts(businessId, options.search);
      }
      return productRepository.findAllWithStock(businessId, options?.active ?? true);
    },
    enabled: !!businessId,
  });
}

export function useProduct(id: string) {
  const businessId = getBusinessId();
  return useQuery({
    queryKey: ['product', businessId, id],
    queryFn: () => productRepository.findById(id, businessId),
    enabled: !!businessId && !!id,
  });
}

export function useCategories() {
  const businessId = getBusinessId();
  return useQuery({
    queryKey: ['categories', businessId],
    queryFn: () => categoryRepository.findActive(businessId),
    enabled: !!businessId,
  });
}

export function useSuppliers() {
  const businessId = getBusinessId();
  return useQuery({
    queryKey: ['suppliers', businessId],
    queryFn: () => supplierRepository.findActive(businessId),
    enabled: !!businessId,
  });
}

export function useCustomers() {
  const businessId = getBusinessId();
  return useQuery({
    queryKey: ['customers', businessId],
    queryFn: () => customerRepository.findActive(businessId),
    enabled: !!businessId,
  });
}

export function usePurchases(dateRange?: { start: string; end: string }) {
  const businessId = getBusinessId();
  return useQuery({
    queryKey: ['purchases', businessId, dateRange],
    queryFn: () => dateRange 
      ? purchaseRepository.findByDateRange(businessId, dateRange.start, dateRange.end)
      : purchaseRepository.findAll(businessId),
    enabled: !!businessId,
  });
}

export function useSales(dateRange?: { start: string; end: string }) {
  const businessId = getBusinessId();
  return useQuery({
    queryKey: ['sales', businessId, dateRange],
    queryFn: () => dateRange
      ? saleRepository.findByDateRange(businessId, dateRange.start, dateRange.end)
      : saleRepository.findAll(businessId),
    enabled: !!businessId,
  });
}

export function useExpenses(dateRange?: { start: string; end: string }) {
  const businessId = getBusinessId();
  return useQuery({
    queryKey: ['expenses', businessId, dateRange],
    queryFn: () => dateRange
      ? expenseRepository.findByDateRange(businessId, dateRange.start, dateRange.end)
      : expenseRepository.findAll(businessId, { limit: 500, orderBy: 'expense_date', orderDirection: 'DESC' }),
    enabled: !!businessId,
  });
}

export function usePayments(dateRange?: { start: string; end: string }) {
  const businessId = getBusinessId();
  return useQuery({
    queryKey: ['payments', businessId, dateRange],
    queryFn: () => dateRange
      ? paymentRepository.findByDateRange(businessId, dateRange.start, dateRange.end)
      : paymentRepository.findAll(businessId),
    enabled: !!businessId,
  });
}

export function useDailyClosing(businessDate: string) {
  const businessId = getBusinessId();
  return useQuery({
    queryKey: ['dailyClosing', businessId, businessDate],
    queryFn: () => dailyClosingRepository.findByDate(businessId, businessDate),
    enabled: !!businessId && !!businessDate,
  });
}

export function useOpenDailyClosing() {
  const businessId = getBusinessId();
  return useQuery({
    queryKey: ['dailyClosing', businessId, 'open'],
    queryFn: () => dailyClosingRepository.findOpenDay(businessId),
    enabled: !!businessId,
  });
}

export function useDashboardStats() {
  const businessId = getBusinessId();
  const today = new Date().toISOString().split('T')[0];
  
  return useQuery({
    queryKey: ['dashboardStats', businessId, today],
    queryFn: async () => {
      const financials = await financialService.calculateDailyFinancials(businessId, today);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayIso = yesterday.toISOString().split('T')[0];
      const [itemsSold, stockValue, yesterdaySales] = await Promise.all([
        financialService.getTotalItemsSold(businessId, today, today),
        productRepository.getStockValue(businessId),
        saleRepository.getTotalSales(businessId, yesterdayIso, yesterdayIso),
      ]);

      return {
        todaySales: financials.totalSales,
        todayGrossProfit: financials.grossProfit,
        todayNetProfit: financials.netProfit,
        todayExpenses: financials.expenses,
        itemsSold,
        stockValue,
        cashSales: financials.cashSales,
        yesterdaySales,
        salesDelta: yesterdaySales > 0 ? (financials.totalSales - yesterdaySales) / yesterdaySales : null,
        cashBalance:
          financials.cashSales +
          financials.customerCashPayments +
          financials.otherCashIncome -
          financials.cashPurchases -
          financials.cashExpenses -
          financials.supplierCashPayments -
          financials.withdrawals,
      };
    },
    enabled: !!businessId,
    refetchInterval: 30000,
  });
}

export function useLowStockProducts() {
  const businessId = getBusinessId();
  return useQuery({
    queryKey: ['lowStockProducts', businessId],
    queryFn: () => productRepository.findLowStock(businessId),
    enabled: !!businessId,
  });
}

export interface DaySales {
  date: string;
  weekday: string;
  dayLabel: string;
  total: number;
  isToday: boolean;
}

function buildDaySeries(sales: Array<{ sale_date: string; total_amount: number }>, days: number): DaySales[] {
  const byDate = new Map<string, number>();
  for (const s of sales) {
    const raw = s?.sale_date;
    if (!raw) continue;
    const day = String(raw).slice(0, 10);
    byDate.set(day, (byDate.get(day) ?? 0) + (s.total_amount ?? 0));
  }
  const series: DaySales[] = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    const iso = d.toISOString().split('T')[0];
    series.push({
      date: iso,
      weekday: d.toLocaleDateString('en', { weekday: 'narrow' }),
      dayLabel: String(d.getDate()),
      total: byDate.get(iso) ?? 0,
      isToday: offset === 0,
    });
  }
  return series;
}

export function useWeeklySales() {
  const businessId = getBusinessId();
  const today = new Date().toISOString().split('T')[0];
  return useQuery({
    queryKey: ['weeklySales', businessId, today],
    queryFn: async (): Promise<DaySales[]> => {
      const start = new Date();
      start.setDate(start.getDate() - 6);
      const sales = await saleRepository.findByDateRange(
        businessId,
        start.toISOString().split('T')[0],
        today
      );
      return buildDaySeries(sales, 7);
    },
    enabled: !!businessId,
  });
}

export function useMonthlySales() {
  const businessId = getBusinessId();
  const today = new Date().toISOString().split('T')[0];
  return useQuery({
    queryKey: ['monthlySales', businessId, today],
    queryFn: async (): Promise<DaySales[]> => {
      const start = new Date();
      start.setDate(start.getDate() - 29);
      const sales = await saleRepository.findByDateRange(
        businessId,
        start.toISOString().split('T')[0],
        today
      );
      return buildDaySeries(sales, 30);
    },
    enabled: !!businessId,
  });
}

export function useSaleItems(saleId: string | null) {
  const businessId = getBusinessId();
  return useQuery({
    queryKey: ['saleItems', businessId, saleId],
    queryFn: () => saleItemRepository.findBySale(saleId!, businessId),
    enabled: !!businessId && !!saleId,
  });
}

export function useStockBalance(productId: string | null) {
  const businessId = getBusinessId();
  return useQuery({
    queryKey: ['stockBalance', businessId, productId],
    queryFn: () => productRepository.getStockBalance(productId!, businessId),
    enabled: !!businessId && !!productId,
  });
}

export function useStockMovements(productId: string | null, limit = 50) {
  const businessId = getBusinessId();
  return useQuery({
    queryKey: ['stockMovements', businessId, productId],
    queryFn: () => stockMovementRepository.findByProduct(productId!, businessId, limit),
    enabled: !!businessId && !!productId,
  });
}

export function useDailyFinancials(businessDate: string) {
  const businessId = getBusinessId();
  return useQuery({
    queryKey: ['dailyFinancials', businessId, businessDate],
    queryFn: () => financialService.calculateDailyFinancials(businessId, businessDate),
    enabled: !!businessId && !!businessDate,
  });
}

export interface PeriodRange {
  start: string;
  end: string;
}

export function usePeriodStats(range: PeriodRange | null) {
  const businessId = getBusinessId();
  return useQuery({
    queryKey: ['periodStats', businessId, range?.start, range?.end],
    queryFn: async () => {
      const { start, end } = range!;
      const [totalSales, cogs, expenses, itemsSold, stockValue] = await Promise.all([
        saleRepository.getTotalSales(businessId, start, end),
        financialService.calculateCOGSForPeriod(businessId, start, end),
        expenseRepository.getTotalExpenses(businessId, start, end),
        financialService.getTotalItemsSold(businessId, start, end),
        productRepository.getStockValue(businessId),
      ]);
      const grossProfit = totalSales - cogs;
      return {
        totalSales,
        cogs,
        grossProfit,
        expenses,
        netProfit: grossProfit - expenses,
        itemsSold,
        stockValue,
      };
    },
    enabled: !!businessId && !!range,
  });
}

export function useTopProducts(range: PeriodRange | null, limit = 5) {
  const businessId = getBusinessId();
  return useQuery({
    queryKey: ['topProducts', businessId, range?.start, range?.end, limit],
    queryFn: () => financialService.getTopProducts(businessId, range!.start, range!.end, limit),
    enabled: !!businessId && !!range,
  });
}

export function usePaymentBreakdown(range: PeriodRange | null) {
  const businessId = getBusinessId();
  return useQuery({
    queryKey: ['paymentBreakdown', businessId, range?.start, range?.end],
    queryFn: async () => {
      const { start, end } = range!;
      const [cash, mobileMoney, bank, credit] = await Promise.all([
        paymentRepository.getTotalByMethod(businessId, start, end, 'cash'),
        paymentRepository.getTotalByMethod(businessId, start, end, 'mobile_money'),
        paymentRepository.getTotalByMethod(businessId, start, end, 'bank'),
        paymentRepository.getTotalByMethod(businessId, start, end, 'credit'),
      ]);
      return { cash, mobileMoney, bank, credit };
    },
    enabled: !!businessId && !!range,
  });
}

export function useCustomerBalance(customerId: string | null) {
  const businessId = getBusinessId();
  return useQuery({
    queryKey: ['customerBalance', businessId, customerId],
    queryFn: async () => {
      if (!customerId) return { owed: 0, paid: 0, outstanding: 0 };
      const [sales, payments] = await Promise.all([
        saleRepository.findByCustomer(customerId, businessId),
        paymentRepository.findAll(businessId, {
          where: { party_id: customerId, type: 'customer_payment' },
        }),
      ]);
      const owed = sales
        .filter((s) => s.payment_status !== 'paid')
        .reduce((sum, s) => sum + s.total_amount, 0);
      const paid = payments.reduce((sum, p) => sum + p.amount, 0);
      return { owed, paid, outstanding: Math.max(0, owed - paid) };
    },
    enabled: !!businessId && !!customerId,
  });
}

export function useSupplierBalance(supplierId: string | null) {
  const businessId = getBusinessId();
  return useQuery({
    queryKey: ['supplierBalance', businessId, supplierId],
    queryFn: async () => {
      if (!supplierId) return { owed: 0, paid: 0, outstanding: 0 };
      const [purchases, payments] = await Promise.all([
        purchaseRepository.findBySupplier(supplierId, businessId),
        paymentRepository.findAll(businessId, {
          where: { party_id: supplierId, type: 'supplier_payment' },
        }),
      ]);
      const owed = purchases.reduce((sum, p) => sum + (p.total_amount - p.paid_amount), 0);
      const paid = payments.reduce((sum, p) => sum + p.amount, 0);
      return { owed, paid, outstanding: Math.max(0, owed - paid) };
    },
    enabled: !!businessId && !!supplierId,
  });
}

export interface CustomerBalanceRow {
  customer: Customer;
  owed: number;
  paid: number;
  outstanding: number;
}

export function useCustomersWithBalances() {
  const businessId = getBusinessId();
  return useQuery({
    queryKey: ['customersWithBalances', businessId],
    queryFn: async (): Promise<{ rows: CustomerBalanceRow[]; totalOutstanding: number }> => {
      const customers = await customerRepository.findActive(businessId);
      const rows = await Promise.all(
        customers.map(async (customer) => {
          const [sales, payments] = await Promise.all([
            saleRepository.findByCustomer(customer.id, businessId),
            paymentRepository.findAll(businessId, {
              where: { party_id: customer.id, type: 'customer_payment' },
            }),
          ]);
          const owed = sales
            .filter((s) => s.payment_status !== 'paid')
            .reduce((sum, s) => sum + s.total_amount, 0);
          const paid = payments.reduce((sum, p) => sum + p.amount, 0);
          return { customer, owed, paid, outstanding: Math.max(0, owed - paid) };
        })
      );
      rows.sort((a, b) => b.outstanding - a.outstanding);
      return { rows, totalOutstanding: rows.reduce((sum, r) => sum + r.outstanding, 0) };
    },
    enabled: !!businessId,
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  const businessId = getBusinessId();
  
  return useMutation({
    mutationFn: async (product: Omit<Product, 'id' | 'created_at' | 'updated_at'>) => {
      const created = await productRepository.create({ ...product, business_id: businessId });
      await queueSync('products', created.id, 'insert', created as unknown as Record<string, unknown>, businessId);
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', businessId] });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  const businessId = getBusinessId();
  
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Product> }) => {
      const updated = await productRepository.update(id, businessId, updates);
      if (updated) {
        await queueSync('products', id, 'update', updated as unknown as Record<string, unknown>, businessId);
      }
      return updated;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['products', businessId] });
      queryClient.invalidateQueries({ queryKey: ['product', businessId, variables.id] });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  const businessId = getBusinessId();

  return useMutation({
    mutationFn: async (id: string) => {
      const updated = await productRepository.update(id, businessId, { active: false });
      if (updated) {
        await queueSync('products', id, 'update', updated as unknown as Record<string, unknown>, businessId);
      }
      return updated;
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['products', businessId] });
      queryClient.invalidateQueries({ queryKey: ['product', businessId, id] });
    },
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  const businessId = getBusinessId();

  return useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const created = await categoryRepository.create({
        business_id: businessId,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        active: true,
      });
      await queueSync('categories', created.id, 'insert', created as unknown as Record<string, unknown>, businessId);
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', businessId] });
    },
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  const businessId = getBusinessId();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      phone?: string;
      email?: string;
      address?: string;
      credit_limit?: number;
    }) => {
      const created = await customerRepository.create({
        business_id: businessId,
        name: data.name.trim(),
        phone: data.phone?.trim() || null,
        email: data.email?.trim() || null,
        address: data.address?.trim() || null,
        credit_limit: data.credit_limit ?? 0,
        active: true,
      });
      await queueSync('customers', created.id, 'insert', created as unknown as Record<string, unknown>, businessId);
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', businessId] });
      queryClient.invalidateQueries({ queryKey: ['customersWithBalances', businessId] });
    },
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  const businessId = getBusinessId();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Pick<Customer, 'name' | 'phone' | 'email' | 'address' | 'credit_limit' | 'active'>>;
    }) => {
      const updated = await customerRepository.update(id, businessId, updates);
      if (updated) {
        await queueSync('customers', id, 'update', updated as unknown as Record<string, unknown>, businessId);
      }
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', businessId] });
      queryClient.invalidateQueries({ queryKey: ['customersWithBalances', businessId] });
    },
  });
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient();
  const businessId = getBusinessId();

  return useMutation({
    mutationFn: async (id: string) => {
      const updated = await customerRepository.update(id, businessId, { active: false });
      if (updated) {
        await queueSync('customers', id, 'update', updated as unknown as Record<string, unknown>, businessId);
      }
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', businessId] });
      queryClient.invalidateQueries({ queryKey: ['customersWithBalances', businessId] });
    },
  });
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();
  const businessId = getBusinessId();

  return useMutation({
    mutationFn: async (data: { name: string; phone?: string; email?: string; address?: string }) => {
      const created = await supplierRepository.create({
        business_id: businessId,
        name: data.name.trim(),
        phone: data.phone?.trim() || null,
        email: data.email?.trim() || null,
        address: data.address?.trim() || null,
        active: true,
      });
      await queueSync('suppliers', created.id, 'insert', created as unknown as Record<string, unknown>, businessId);
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers', businessId] });
    },
  });
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient();
  const businessId = getBusinessId();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Pick<Supplier, 'name' | 'phone' | 'email' | 'address' | 'active'>>;
    }) => {
      const updated = await supplierRepository.update(id, businessId, updates);
      if (updated) {
        await queueSync('suppliers', id, 'update', updated as unknown as Record<string, unknown>, businessId);
      }
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers', businessId] });
    },
  });
}

export function useDeleteSupplier() {
  const queryClient = useQueryClient();
  const businessId = getBusinessId();

  return useMutation({
    mutationFn: async (id: string) => {
      const updated = await supplierRepository.update(id, businessId, { active: false });
      if (updated) {
        await queueSync('suppliers', id, 'update', updated as unknown as Record<string, unknown>, businessId);
      }
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers', businessId] });
    },
  });
}

export function useImportProducts() {
  const queryClient = useQueryClient();
  const businessId = getBusinessId();

  return useMutation({
    mutationFn: async (rows: import('@/services/products/importProducts').ProductImportRow[]) => {
      const { businessId: bid, userId, deviceId } = requireAuthContext();
      const categories = await categoryRepository.findActive(bid);
      const categoryByName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c]));

      let created = 0;
      let updated = 0;
      let stocked = 0;
      const errors: string[] = [];

      for (const row of rows) {
        try {
          let categoryId: string | null = null;
          if (row.category) {
            const key = row.category.trim().toLowerCase();
            let cat = categoryByName.get(key);
            if (!cat) {
              cat = await categoryRepository.create({
                business_id: bid,
                name: row.category.trim(),
                description: null,
                active: true,
              });
              categoryByName.set(key, cat);
              await queueSync('categories', cat.id, 'insert', cat as unknown as Record<string, unknown>, bid);
            }
            categoryId = cat.id;
          }

          const existing =
            (row.sku ? await productRepository.findBySku(row.sku, bid) : null) ??
            (row.barcode ? await productRepository.findByBarcode(row.barcode, bid) : null);

          let productId: string;
          if (existing) {
            const updatedProduct = await productRepository.update(existing.id, bid, {
              name: row.name,
              category_id: categoryId ?? existing.category_id,
              unit: row.unit || existing.unit,
              selling_price: row.selling_price,
              average_cost: row.average_cost || existing.average_cost,
              reorder_level: row.reorder_level,
              track_inventory: row.track_inventory,
              active: true,
              sku: row.sku || existing.sku,
              barcode: row.barcode || existing.barcode,
            });
            if (updatedProduct) {
              await queueSync(
                'products',
                existing.id,
                'update',
                updatedProduct as unknown as Record<string, unknown>,
                bid
              );
            }
            productId = existing.id;
            updated++;
          } else {
            const createdProduct = await productRepository.create({
              business_id: bid,
              category_id: categoryId,
              name: row.name,
              sku: row.sku || null,
              barcode: row.barcode || null,
              unit: row.unit || 'pcs',
              selling_price: row.selling_price,
              average_cost: row.average_cost,
              reorder_level: row.reorder_level,
              track_inventory: row.track_inventory,
              active: true,
            });
            await queueSync(
              'products',
              createdProduct.id,
              'insert',
              createdProduct as unknown as Record<string, unknown>,
              bid
            );
            productId = createdProduct.id;
            created++;
          }

          if (row.opening_stock > 0) {
            const movement = await stockMovementRepository.create({
              id: generateUUID(),
              business_id: bid,
              product_id: productId,
              type: 'opening',
              quantity: row.opening_stock,
              unit_cost: row.average_cost,
              reference_type: null,
              reference_id: null,
              occurred_at: new Date().toISOString(),
              created_by: userId,
              device_id: deviceId,
              sync_status: 'pending',
            });
            await queueSync(
              'stock_movements',
              movement.id,
              'insert',
              movement as unknown as Record<string, unknown>,
              bid
            );
            stocked++;
          }
        } catch (error) {
          errors.push(`Row ${row.rowNumber}: ${String(error)}`);
        }
      }

      return { created, updated, stocked, errors };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', businessId] });
      queryClient.invalidateQueries({ queryKey: ['categories', businessId] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats', businessId] });
      queryClient.invalidateQueries({ queryKey: ['lowStockProducts', businessId] });
    },
  });
}

export function useCreateSale() {
  const queryClient = useQueryClient();
  const businessId = getBusinessId();
  
  return useMutation({
    mutationFn: async (data: {
      customerId: string | null;
      items: Array<{ productId: string; quantity: number; sellingPrice: number; discountAmount?: number; taxAmount?: number }>;
      paymentMethod: 'cash' | 'mobile_money' | 'bank' | 'credit';
      notes?: string;
    }) => {
      const { businessId: bid, userId, deviceId } = requireAuthContext();
      const totals = await financialService.calculateSaleTotals(
        data.items.map(item => ({
          product_id: item.productId,
          quantity: item.quantity,
          selling_price: item.sellingPrice,
          discount_amount: item.discountAmount,
          tax_amount: item.taxAmount,
        })),
        bid
      );
      
      const saleId = generateUUID();
      const now = new Date().toISOString();
      const today = now.split('T')[0];
      
      const sale = await saleRepository.create({
        id: saleId,
        business_id: bid,
        customer_id: data.customerId,
        reference_number: `SALE-${Date.now().toString(36).toUpperCase()}`,
        subtotal: totals.subtotal,
        discount_amount: totals.discountAmount,
        tax_amount: totals.taxAmount,
        total_amount: totals.totalAmount,
        payment_status: data.paymentMethod === 'credit' ? 'credit' : 'paid',
        sale_date: today,
        notes: data.notes ?? null,
        created_by: userId,
        device_id: deviceId,
        sync_status: 'pending',
      });
      
      for (const item of totals.itemsWithCost) {
        const saleItem = await saleItemRepository.create({
          id: generateUUID(),
          business_id: bid,
          sale_id: saleId,
          product_id: item.product_id,
          quantity: item.quantity,
          selling_price: item.selling_price,
          unit_cost: item.unit_cost,
          discount_amount: item.discount_amount ?? 0,
          tax_amount: item.tax_amount ?? 0,
          total_amount: item.quantity * item.selling_price - (item.discount_amount ?? 0) + (item.tax_amount ?? 0),
        });
        
        const movement = await stockMovementRepository.create({
          id: generateUUID(),
          business_id: bid,
          product_id: item.product_id,
          type: 'sale',
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          reference_type: 'sale',
          reference_id: saleId,
          occurred_at: now,
          created_by: userId,
          device_id: deviceId,
          sync_status: 'pending',
        });

        await queueSync('sale_items', saleItem.id, 'insert', saleItem as unknown as Record<string, unknown>, bid);
        await queueSync('stock_movements', movement.id, 'insert', movement as unknown as Record<string, unknown>, bid);
      }
      
      if (data.paymentMethod !== 'credit') {
        const payment = await paymentRepository.create({
          id: generateUUID(),
          business_id: bid,
          type: 'sale_payment',
          payment_method: data.paymentMethod,
          amount: totals.totalAmount,
          reference_type: 'sale',
          reference_id: saleId,
          party_id: data.customerId,
          payment_date: today,
          notes: data.notes ?? null,
          created_by: userId,
          device_id: deviceId,
          sync_status: 'pending',
        });
        await queueSync('payments', payment.id, 'insert', payment as unknown as Record<string, unknown>, bid);
      }

      await queueSync('sales', sale.id, 'insert', sale as unknown as Record<string, unknown>, bid);
      return sale;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales', businessId] });
      queryClient.invalidateQueries({ queryKey: ['products', businessId] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats', businessId] });
      queryClient.invalidateQueries({ queryKey: ['payments', businessId] });
      queryClient.invalidateQueries({ queryKey: ['customersWithBalances', businessId] });
    },
  });
}

export function useCreatePurchase() {
  const queryClient = useQueryClient();
  const businessId = getBusinessId();
  
  return useMutation({
    mutationFn: async (data: {
      supplierId: string;
      items: Array<{ productId: string; quantity: number; unitCost: number }>;
      paymentMethod: 'cash' | 'mobile_money' | 'bank' | 'credit';
      referenceNumber?: string;
      notes?: string;
    }) => {
      const totals = await financialService.calculatePurchaseTotals(
        data.items.map(item => ({
          product_id: item.productId,
          quantity: item.quantity,
          unit_cost: item.unitCost,
        }))
      );
      
      const purchaseId = generateUUID();
      const now = new Date().toISOString();
      const today = now.split('T')[0];
      
      // Create purchase
      const purchase = await purchaseRepository.create({
        id: purchaseId,
        business_id: businessId,
        supplier_id: data.supplierId,
        reference_number: data.referenceNumber ?? `PUR-${Date.now().toString(36).toUpperCase()}`,
        total_amount: totals.totalAmount,
        paid_amount: data.paymentMethod === 'credit' ? 0 : totals.totalAmount,
        status: data.paymentMethod === 'credit' ? 'pending' : 'completed',
        purchase_date: today,
        notes: data.notes ?? null,
        created_by: getUserId(),
        device_id: getDeviceId(),
        sync_status: 'pending',
      });
      
      for (const item of totals.itemsWithTotal) {
        const purchaseItem = await purchaseItemRepository.create({
          id: generateUUID(),
          business_id: businessId,
          purchase_id: purchaseId,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          total_cost: item.total_cost,
        });
        
        const movement = await stockMovementRepository.create({
          id: generateUUID(),
          business_id: businessId,
          product_id: item.product_id,
          type: 'purchase',
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          reference_type: 'purchase',
          reference_id: purchaseId,
          occurred_at: now,
          created_by: getUserId(),
          device_id: getDeviceId(),
          sync_status: 'pending',
        });
        
        await financialService.updateProductAverageCost(item.product_id, businessId, item.quantity, item.unit_cost);
        const product = await productRepository.findById(item.product_id, businessId);

        await queueSync('purchase_items', purchaseItem.id, 'insert', purchaseItem as unknown as Record<string, unknown>, businessId);
        await queueSync('stock_movements', movement.id, 'insert', movement as unknown as Record<string, unknown>, businessId);
        if (product) {
          await queueSync('products', product.id, 'update', product as unknown as Record<string, unknown>, businessId);
        }
      }

      await queueSync('purchases', purchase.id, 'insert', purchase as unknown as Record<string, unknown>, businessId);

      if (data.paymentMethod !== 'credit') {
        const payment = await paymentRepository.create({
          id: generateUUID(),
          business_id: businessId,
          type: 'purchase_payment',
          payment_method: data.paymentMethod,
          amount: totals.totalAmount,
          reference_type: 'purchase',
          reference_id: purchaseId,
          party_id: data.supplierId,
          payment_date: today,
          notes: data.notes ?? null,
          created_by: getUserId(),
          device_id: getDeviceId(),
          sync_status: 'pending',
        });
        await queueSync('payments', payment.id, 'insert', payment as unknown as Record<string, unknown>, businessId);
      }

      return purchase;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases', businessId] });
      queryClient.invalidateQueries({ queryKey: ['products', businessId] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats', businessId] });
      queryClient.invalidateQueries({ queryKey: ['payments', businessId] });
      queryClient.invalidateQueries({ queryKey: ['dailyClosing', businessId] });
    },
  });
}

export function useCreateExpense() {
  const queryClient = useQueryClient();
  const businessId = getBusinessId();
  
  return useMutation({
    mutationFn: async (data: {
      category: Expense['category'];
      amount: number;
      paymentMethod: PaymentMethod;
      description?: string;
      expenseDate: string;
      referenceNumber?: string;
    }) => {
      const expense = await expenseRepository.create({
        id: generateUUID(),
        business_id: businessId,
        category: data.category,
        amount: data.amount,
        payment_method: data.paymentMethod,
        description: data.description ?? null,
        expense_date: data.expenseDate,
        reference_number: data.referenceNumber ?? null,
        created_by: getUserId(),
        device_id: getDeviceId(),
        sync_status: 'pending',
      });
      
      const payment = await paymentRepository.create({
        id: generateUUID(),
        business_id: businessId,
        type: 'expense_payment',
        payment_method: data.paymentMethod,
        amount: data.amount,
        reference_type: 'expense',
        reference_id: expense.id,
        party_id: null,
        payment_date: data.expenseDate,
        notes: null,
        created_by: getUserId(),
        device_id: getDeviceId(),
        sync_status: 'pending',
      });

      await queueSync('expenses', expense.id, 'insert', expense as unknown as Record<string, unknown>, businessId);
      await queueSync('payments', payment.id, 'insert', payment as unknown as Record<string, unknown>, businessId);
      return expense;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', businessId] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats', businessId] });
      queryClient.invalidateQueries({ queryKey: ['payments', businessId] });
      queryClient.invalidateQueries({ queryKey: ['dailyClosing', businessId] });
    },
  });
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();
  const businessId = getBusinessId();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: {
        category: Expense['category'];
        amount: number;
        paymentMethod: PaymentMethod;
        description?: string;
        expenseDate: string;
        referenceNumber?: string;
      };
    }) => {
      const updated = await expenseRepository.update(id, businessId, {
        category: updates.category,
        amount: updates.amount,
        payment_method: updates.paymentMethod,
        description: updates.description ?? null,
        expense_date: updates.expenseDate,
        reference_number: updates.referenceNumber ?? null,
        sync_status: 'pending',
      });

      if (updated) {
        await queueSync('expenses', id, 'update', updated as unknown as Record<string, unknown>, businessId);
        const linked = await paymentRepository.findByReference('expense', id, businessId);
        for (const payment of linked) {
          const nextPayment = await paymentRepository.update(payment.id, businessId, {
            amount: updates.amount,
            payment_method: updates.paymentMethod,
            payment_date: updates.expenseDate,
            sync_status: 'pending',
          });
          if (nextPayment) {
            await queueSync(
              'payments',
              payment.id,
              'update',
              nextPayment as unknown as Record<string, unknown>,
              businessId
            );
          }
        }
      }

      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', businessId] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats', businessId] });
      queryClient.invalidateQueries({ queryKey: ['payments', businessId] });
      queryClient.invalidateQueries({ queryKey: ['dailyClosing', businessId] });
    },
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  const businessId = getBusinessId();

  return useMutation({
    mutationFn: async (id: string) => {
      const linked = await paymentRepository.findByReference('expense', id, businessId);
      for (const payment of linked) {
        await paymentRepository.delete(payment.id, businessId);
        await queueSync('payments', payment.id, 'delete', { id: payment.id }, businessId);
      }
      await expenseRepository.delete(id, businessId);
      await queueSync('expenses', id, 'delete', { id }, businessId);
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', businessId] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats', businessId] });
      queryClient.invalidateQueries({ queryKey: ['payments', businessId] });
      queryClient.invalidateQueries({ queryKey: ['dailyClosing', businessId] });
    },
  });
}

export function useCreatePayment() {
  const queryClient = useQueryClient();
  const businessId = getBusinessId();

  return useMutation({
    mutationFn: async (data: {
      type: Payment['type'];
      paymentMethod: Payment['payment_method'];
      amount: number;
      referenceType: Payment['reference_type'];
      referenceId: string | null;
      partyId: string | null;
      paymentDate: string;
      notes?: string | null;
    }) => {
      const payment = await paymentRepository.create({
        id: generateUUID(),
        business_id: businessId,
        type: data.type,
        payment_method: data.paymentMethod,
        amount: data.amount,
        reference_type: data.referenceType,
        reference_id: data.referenceId,
        party_id: data.partyId,
        payment_date: data.paymentDate,
        notes: data.notes ?? null,
        created_by: getUserId(),
        device_id: getDeviceId(),
        sync_status: 'pending',
      });

      await queueSync('payments', payment.id, 'insert', payment as unknown as Record<string, unknown>, businessId);
      return payment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments', businessId] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats', businessId] });
      queryClient.invalidateQueries({ queryKey: ['customersWithBalances', businessId] });
    },
  });
}

export function useStartDay() {
  const queryClient = useQueryClient();
  const businessId = getBusinessId();

  return useMutation({
    mutationFn: async (data: { businessDate: string; openingCash: number; notes?: string }) => {
      const { userId } = requireAuthContext();
      const existing = await dailyClosingRepository.findByDate(businessId, data.businessDate);
      if (existing?.status === 'closed') {
        throw new Error('DAY_ALREADY_CLOSED');
      }
      if (existing?.status === 'open') {
        throw new Error('DAY_ALREADY_OPEN');
      }

      const closing = await dailyClosingRepository.create({
        id: generateUUID(),
        business_id: businessId,
        business_date: data.businessDate,
        opening_cash: data.openingCash,
        cash_sales: 0,
        customer_cash_payments: 0,
        other_cash_income: 0,
        cash_purchases: 0,
        cash_expenses: 0,
        supplier_cash_payments: 0,
        withdrawals: 0,
        expected_cash: data.openingCash,
        actual_cash: 0,
        cash_variance: 0,
        total_sales: 0,
        cogs: 0,
        gross_profit: 0,
        expenses: 0,
        net_profit: 0,
        notes: data.notes ?? null,
        closed_by: null,
        closed_at: null,
        status: 'open',
      });
      await queueSync(
        'daily_closings',
        closing.id,
        'insert',
        closing as unknown as Record<string, unknown>,
        businessId
      );
      return closing;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dailyClosing', businessId] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats', businessId] });
    },
  });
}

export function useCloseDay() {
  const queryClient = useQueryClient();
  const businessId = getBusinessId();
  
  return useMutation({
    mutationFn: async (data: {
      businessDate: string;
      openingCash: number;
      actualCash: number;
      notes?: string;
    }) => {
      const { userId } = requireAuthContext();
      const reconciliation = await financialService.calculateCashReconciliation(
        businessId,
        data.businessDate,
        data.openingCash,
        data.actualCash
      );
      const financials = await financialService.calculateDailyFinancials(businessId, data.businessDate);

      const existing = await dailyClosingRepository.findByDate(businessId, data.businessDate);
      const payload = {
        opening_cash: data.openingCash,
        cash_sales: reconciliation.breakdown.cashSales,
        customer_cash_payments: reconciliation.breakdown.customerCashPayments,
        other_cash_income: reconciliation.breakdown.otherCashIncome,
        cash_purchases: reconciliation.breakdown.cashPurchases,
        cash_expenses: reconciliation.breakdown.cashExpenses,
        supplier_cash_payments: reconciliation.breakdown.supplierCashPayments,
        withdrawals: reconciliation.breakdown.withdrawals,
        expected_cash: reconciliation.expectedCash,
        actual_cash: data.actualCash,
        cash_variance: reconciliation.cashVariance,
        total_sales: financials.totalSales,
        cogs: financials.cogs,
        gross_profit: financials.grossProfit,
        expenses: financials.expenses,
        net_profit: financials.netProfit,
        notes: data.notes ?? null,
        closed_by: userId,
        closed_at: new Date().toISOString(),
        status: 'closed' as const,
      };

      let closing;
      if (existing) {
        closing = await dailyClosingRepository.update(existing.id, businessId, payload);
      } else {
        closing = await dailyClosingRepository.create({
          id: generateUUID(),
          business_id: businessId,
          business_date: data.businessDate,
          ...payload,
        });
      }

      if (closing) {
        await queueSync(
          'daily_closings',
          closing.id,
          existing ? 'update' : 'insert',
          closing as unknown as Record<string, unknown>,
          businessId
        );
      }
      
      return { closing, reconciliation };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dailyClosing', businessId] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats', businessId] });
    },
  });
}