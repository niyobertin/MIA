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
import { userRepository } from '@/repositories/users/users';
import { financialService } from '@/services/financial';
import { queueSync } from '@/services/sync/queue';
import { getDatabase } from '@/db/database';
import { assertDayIsOpen, assertSaleAllowed } from '@/services/books/guards';
import { settleCustomerAccount, settleSupplierAccount } from '@/services/books/settle';
import { voidSale } from '@/services/books/voidSale';
import { voidPurchase } from '@/services/books/voidPurchase';
import { adjustStock, StockAdjustmentKind } from '@/services/books/adjustStock';
import { recordStockMovement } from '@/services/books/recordStockMovement';
import { captureOpeningStock, sealClosingStock } from '@/services/books/dailyStock';
import { dailyStockLineRepository } from '@/repositories/reports/dailyStock';
import { reconcileProductCost } from '@/services/books/averageCost';
import { Product, Category, Supplier, Customer, Purchase, Sale, Expense, Payment, PaymentMethod, DailyClosing, StockMovement } from '@/types';
import { getTodayDateString, getYesterdayDateString } from '@/utils/formatters';
import { toLocalDateString } from '@/utils/periodBounds';

const getBusinessId = () => useAuthStore.getState().business?.id ?? '';
const getUserId = () => useAuthStore.getState().user?.id ?? '';
const getRole = () => useAuthStore.getState().user?.role ?? null;
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
  const today = getTodayDateString();
  
  return useQuery({
    queryKey: ['dashboardStats', businessId, today],
    queryFn: async () => {
      const financials = await financialService.calculateDailyFinancials(businessId, today);
      const yesterdayIso = getYesterdayDateString();
      const [itemsSold, stockValue, yesterdaySales, day] = await Promise.all([
        financialService.getTotalItemsSold(businessId, today, today),
        productRepository.getStockValue(businessId),
        saleRepository.getTotalSales(businessId, yesterdayIso, yesterdayIso),
        dailyClosingRepository.findByDate(businessId, today),
      ]);
      const openingCash = day?.opening_cash ?? 0;

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
          openingCash +
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
    const iso = toLocalDateString(d);
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
  const today = getTodayDateString();
  return useQuery({
    queryKey: ['weeklySales', businessId, today],
    queryFn: async (): Promise<DaySales[]> => {
      const start = new Date();
      start.setDate(start.getDate() - 6);
      const sales = await saleRepository.findByDateRange(
        businessId,
        toLocalDateString(start),
        today
      );
      return buildDaySeries(sales, 7);
    },
    enabled: !!businessId,
  });
}

export function useMonthlySales() {
  const businessId = getBusinessId();
  const today = getTodayDateString();
  return useQuery({
    queryKey: ['monthlySales', businessId, today],
    queryFn: async (): Promise<DaySales[]> => {
      const start = new Date();
      start.setDate(start.getDate() - 29);
      const sales = await saleRepository.findByDateRange(
        businessId,
        toLocalDateString(start),
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

export function useDayStockLines(businessDate: string | null) {
  const businessId = getBusinessId();
  return useQuery({
    queryKey: ['dayStockLines', businessId, businessDate],
    queryFn: () => dailyStockLineRepository.findByDate(businessId, businessDate!),
    enabled: !!businessId && !!businessDate,
  });
}

export function useStockMovementHistory(filters: {
  startDate?: string;
  endDate?: string;
  productId?: string;
  type?: string;
  userId?: string;
  quantity?: number;
}) {
  const businessId = getBusinessId();
  return useQuery({
    queryKey: ['stockMovementHistory', businessId, filters],
    queryFn: () => stockMovementRepository.search(businessId, filters),
    enabled: !!businessId,
  });
}

export function useBusinessUsers() {
  const businessId = getBusinessId();
  return useQuery({
    queryKey: ['businessUsers', businessId],
    queryFn: () => userRepository.findActiveUsers(businessId),
    enabled: !!businessId,
  });
}

export function useTrackedStock() {
  const businessId = getBusinessId();
  return useQuery({
    queryKey: ['trackedStock', businessId],
    queryFn: () => productRepository.getTrackedBalances(businessId),
    enabled: !!businessId,
  });
}

export function useStockSnapshot() {
  const businessId = getBusinessId();
  return useQuery({
    queryKey: ['stockSnapshot', businessId],
    queryFn: () => productRepository.getStockSnapshot(businessId),
    enabled: !!businessId,
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
      const [totalSales, tax, cogs, expenses, inventoryLoss, itemsSold, stockValue] = await Promise.all([
        saleRepository.getTotalSales(businessId, start, end),
        saleRepository.getTotalTax(businessId, start, end),
        financialService.calculateCOGSForPeriod(businessId, start, end),
        expenseRepository.getTotalExpenses(businessId, start, end),
        stockMovementRepository.getInventoryLoss(businessId, start, end),
        financialService.getTotalItemsSold(businessId, start, end),
        productRepository.getStockValue(businessId),
      ]);
      const revenue = totalSales - tax;
      const grossProfit = revenue - cogs;
      return {
        totalSales,
        cogs,
        grossProfit,
        expenses,
        netProfit: grossProfit - expenses - inventoryLoss,
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
        paymentRepository.getInflowByMethod(businessId, start, end, 'cash'),
        paymentRepository.getInflowByMethod(businessId, start, end, 'mobile_money'),
        paymentRepository.getInflowByMethod(businessId, start, end, 'bank'),
        saleRepository.getReceivableInPeriod(businessId, start, end),
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
      return saleRepository.getCustomerPosition(customerId, businessId);
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
      return purchaseRepository.getSupplierPosition(supplierId, businessId);
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
      const [customers, positions] = await Promise.all([
        customerRepository.findActive(businessId),
        saleRepository.listCustomerPositions(businessId),
      ]);
      const byId = new Map(positions.map((position) => [position.customer_id, position]));
      const rows = customers.map((customer) => {
        const position = byId.get(customer.id);
        return {
          customer,
          owed: position?.owed ?? 0,
          paid: position?.paid ?? 0,
          outstanding: position?.outstanding ?? 0,
        };
      });
      rows.sort((a, b) => b.outstanding - a.outstanding);
      return { rows, totalOutstanding: rows.reduce((sum, row) => sum + row.outstanding, 0) };
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
      let next = updates;
      if (updates.average_cost != null) {
        const movements = await stockMovementRepository.findByProduct(id, businessId, 1);
        if (movements.length > 0) {
          const { average_cost: _cost, ...rest } = updates;
          next = rest;
        }
      }
      const updated = await productRepository.update(id, businessId, next);
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

          if (!existing && row.opening_stock > 0) {
            await recordStockMovement({
              businessId: bid,
              productId,
              userId,
              deviceId,
              role: getRole(),
              type: 'opening',
              quantity: row.opening_stock,
              unitCost: row.average_cost,
              referenceType: 'opening_balance',
              referenceId: null,
              reason: 'Opening stock',
            });
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
      const db = await getDatabase();
      let sale: Sale | null = null;
      await db.withTransactionAsync(async () => {
        const today = getTodayDateString();
        await assertDayIsOpen(bid, today);
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
        await assertSaleAllowed(bid, data.items, data.paymentMethod, data.customerId, totals.totalAmount);

        const saleId = generateUUID();
        const now = new Date().toISOString();
        const created = await saleRepository.create({
          id: saleId,
          business_id: bid,
          customer_id: data.customerId,
          reference_number: `SALE-${Date.now().toString(36).toUpperCase()}`,
          subtotal: totals.subtotal,
          discount_amount: totals.discountAmount,
          tax_amount: totals.taxAmount,
          total_amount: totals.totalAmount,
          paid_amount: data.paymentMethod === 'credit' ? 0 : totals.totalAmount,
          voided: false,
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
          await queueSync('sale_items', saleItem.id, 'insert', saleItem as unknown as Record<string, unknown>, bid);

          const product = await productRepository.findById(item.product_id, bid);
          if (product?.track_inventory) {
            await recordStockMovement({
              businessId: bid,
              productId: item.product_id,
              userId,
              deviceId,
              role: getRole(),
              type: 'sale',
              quantity: item.quantity,
              unitCost: item.unit_cost,
              referenceType: 'sale',
              referenceId: saleId,
              occurredAt: now,
              businessDate: today,
            });
          }
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

        await queueSync('sales', created.id, 'insert', created as unknown as Record<string, unknown>, bid);
        await settleCustomerAccount(bid, data.customerId);
        sale = (await saleRepository.findById(saleId, bid)) ?? created;
      });
      if (!sale) throw new Error('SALE_NOT_FOUND');
      return sale;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales', businessId] });
      queryClient.invalidateQueries({ queryKey: ['products', businessId] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats', businessId] });
      queryClient.invalidateQueries({ queryKey: ['weeklySales', businessId] });
      queryClient.invalidateQueries({ queryKey: ['monthlySales', businessId] });
      queryClient.invalidateQueries({ queryKey: ['payments', businessId] });
      queryClient.invalidateQueries({ queryKey: ['customersWithBalances', businessId] });
      queryClient.invalidateQueries({ queryKey: ['stockSnapshot', businessId] });
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
      const { businessId: bid, userId, deviceId } = requireAuthContext();
      for (const item of data.items) {
        if (!Number.isInteger(item.quantity) || item.quantity < 1) throw new Error('INVALID_QUANTITY');
        if (!Number.isInteger(item.unitCost) || item.unitCost < 0) throw new Error('INVALID_PRICE');
      }
      const db = await getDatabase();
      let purchase: Purchase | null = null;
      await db.withTransactionAsync(async () => {
        const today = getTodayDateString();
        await assertDayIsOpen(bid, today);
        const totals = await financialService.calculatePurchaseTotals(
          data.items.map(item => ({
            product_id: item.productId,
            quantity: item.quantity,
            unit_cost: item.unitCost,
          }))
        );

        const purchaseId = generateUUID();
        const now = new Date().toISOString();
        const created = await purchaseRepository.create({
          id: purchaseId,
          business_id: bid,
          supplier_id: data.supplierId,
          reference_number: data.referenceNumber ?? `PUR-${Date.now().toString(36).toUpperCase()}`,
          total_amount: totals.totalAmount,
          paid_amount: data.paymentMethod === 'credit' ? 0 : totals.totalAmount,
          status: data.paymentMethod === 'credit' ? 'pending' : 'completed',
          purchase_date: today,
          notes: data.notes ?? null,
          created_by: userId,
          device_id: deviceId,
          sync_status: 'pending',
        });

        for (const item of totals.itemsWithTotal) {
          const purchaseItem = await purchaseItemRepository.create({
            id: generateUUID(),
            business_id: bid,
            purchase_id: purchaseId,
            product_id: item.product_id,
            quantity: item.quantity,
            unit_cost: item.unit_cost,
            total_cost: item.total_cost,
          });
          await queueSync('purchase_items', purchaseItem.id, 'insert', purchaseItem as unknown as Record<string, unknown>, bid);

          const productBefore = await productRepository.findById(item.product_id, bid);
          if (productBefore?.track_inventory) {
            await recordStockMovement({
              businessId: bid,
              productId: item.product_id,
              userId,
              deviceId,
              role: getRole(),
              type: 'purchase',
              quantity: item.quantity,
              unitCost: item.unit_cost,
              referenceType: 'purchase',
              referenceId: purchaseId,
              occurredAt: now,
              businessDate: today,
            });
            await reconcileProductCost(bid, item.product_id);
            const product = await productRepository.findById(item.product_id, bid);
            if (product) {
              await queueSync('products', product.id, 'update', product as unknown as Record<string, unknown>, bid);
            }
          }
        }

        await queueSync('purchases', created.id, 'insert', created as unknown as Record<string, unknown>, bid);

        if (data.paymentMethod !== 'credit') {
          const payment = await paymentRepository.create({
            id: generateUUID(),
            business_id: bid,
            type: 'purchase_payment',
            payment_method: data.paymentMethod,
            amount: totals.totalAmount,
            reference_type: 'purchase',
            reference_id: purchaseId,
            party_id: data.supplierId,
            payment_date: today,
            notes: data.notes ?? null,
            created_by: userId,
            device_id: deviceId,
            sync_status: 'pending',
          });
          await queueSync('payments', payment.id, 'insert', payment as unknown as Record<string, unknown>, bid);
        }

        await settleSupplierAccount(bid, data.supplierId);
        purchase = (await purchaseRepository.findById(purchaseId, bid)) ?? created;
      });
      if (!purchase) throw new Error('PURCHASE_NOT_FOUND');
      return purchase;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases', businessId] });
      queryClient.invalidateQueries({ queryKey: ['products', businessId] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats', businessId] });
      queryClient.invalidateQueries({ queryKey: ['payments', businessId] });
      queryClient.invalidateQueries({ queryKey: ['dailyClosing', businessId] });
      queryClient.invalidateQueries({ queryKey: ['stockSnapshot', businessId] });
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
      const { businessId: bid, userId, deviceId } = requireAuthContext();
      await assertDayIsOpen(bid, data.expenseDate);
      const expense = await expenseRepository.create({
        id: generateUUID(),
        business_id: bid,
        category: data.category,
        amount: data.amount,
        payment_method: data.paymentMethod,
        description: data.description ?? null,
        expense_date: data.expenseDate,
        reference_number: data.referenceNumber ?? null,
        created_by: userId,
        device_id: deviceId,
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
      const existing = await expenseRepository.findById(id, businessId);
      if (!existing) throw new Error('EXPENSE_NOT_FOUND');
      await assertDayIsOpen(businessId, existing.expense_date);
      await assertDayIsOpen(businessId, updates.expenseDate);
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
      const existing = await expenseRepository.findById(id, businessId);
      if (!existing) throw new Error('EXPENSE_NOT_FOUND');
      await assertDayIsOpen(businessId, existing.expense_date);
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
      const { businessId: bid } = requireAuthContext();
      await assertDayIsOpen(bid, data.paymentDate);
      const db = await getDatabase();
      let payment: Payment | null = null;
      await db.withTransactionAsync(async () => {
      const created = await paymentRepository.create({
        id: generateUUID(),
        business_id: bid,
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

      await queueSync('payments', created.id, 'insert', created as unknown as Record<string, unknown>, bid);
      if (data.type === 'customer_payment') {
        await settleCustomerAccount(bid, data.partyId);
      }
      if (data.type === 'supplier_payment') {
        await settleSupplierAccount(bid, data.partyId);
      }
      payment = created;
      });
      if (!payment) throw new Error('PAYMENT_NOT_FOUND');
      return payment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments', businessId] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats', businessId] });
      queryClient.invalidateQueries({ queryKey: ['customersWithBalances', businessId] });
      queryClient.invalidateQueries({ queryKey: ['customerBalance', businessId] });
      queryClient.invalidateQueries({ queryKey: ['supplierBalance', businessId] });
      queryClient.invalidateQueries({ queryKey: ['sales', businessId] });
      queryClient.invalidateQueries({ queryKey: ['purchases', businessId] });
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

      const snapshot = await productRepository.getStockSnapshot(businessId);
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
        opening_stock_qty: snapshot.quantity,
        opening_stock_value: snapshot.value,
        closing_stock_qty: 0,
        closing_stock_value: 0,
        notes: data.notes ?? null,
        opened_by: userId,
        opened_at: new Date().toISOString(),
        closed_by: null,
        closed_at: null,
        status: 'open',
      });
      await captureOpeningStock({
        businessId,
        dailyClosingId: closing.id,
        businessDate: data.businessDate,
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
      queryClient.invalidateQueries({ queryKey: ['stockSnapshot', businessId] });
      queryClient.invalidateQueries({ queryKey: ['dayStockLines', businessId] });
      queryClient.invalidateQueries({ queryKey: ['trackedStock', businessId] });
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
      const snapshot = await productRepository.getStockSnapshot(businessId);

      const existing = await dailyClosingRepository.findByDate(businessId, data.businessDate);
      let openingStockQty = existing?.opening_stock_qty ?? snapshot.quantity;
      let openingStockValue = existing?.opening_stock_value ?? snapshot.value;
      if (!existing) {
        const net = await productRepository.getNetMovementForDate(businessId, data.businessDate);
        openingStockQty = snapshot.quantity - net.quantity;
        openingStockValue = snapshot.value - net.value;
      }
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
        opening_stock_qty: openingStockQty,
        opening_stock_value: openingStockValue,
        closing_stock_qty: snapshot.quantity,
        closing_stock_value: snapshot.value,
        notes: data.notes ?? null,
        opened_by: existing?.opened_by ?? userId,
        opened_at: existing?.opened_at ?? new Date().toISOString(),
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
        await sealClosingStock({
          businessId,
          dailyClosingId: closing.id,
          businessDate: data.businessDate,
        });
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
      queryClient.invalidateQueries({ queryKey: ['stockSnapshot', businessId] });
      queryClient.invalidateQueries({ queryKey: ['dayStockLines', businessId] });
      queryClient.invalidateQueries({ queryKey: ['trackedStock', businessId] });
    },
  });
}

export function useLatestClosing() {
  const businessId = getBusinessId();
  return useQuery({
    queryKey: ['dailyClosing', businessId, 'latest'],
    queryFn: () => dailyClosingRepository.getLatestClosing(businessId),
    enabled: !!businessId,
  });
}

export function useVoidSale() {
  const queryClient = useQueryClient();
  const businessId = getBusinessId();

  return useMutation({
    mutationFn: async (saleId: string) => {
      const { businessId: bid, userId, deviceId } = requireAuthContext();
      const db = await getDatabase();
      await db.withTransactionAsync(async () => {
        await voidSale({ businessId: bid, saleId, userId, deviceId, role: getRole() });
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales', businessId] });
      queryClient.invalidateQueries({ queryKey: ['products', businessId] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats', businessId] });
      queryClient.invalidateQueries({ queryKey: ['payments', businessId] });
      queryClient.invalidateQueries({ queryKey: ['customersWithBalances', businessId] });
      queryClient.invalidateQueries({ queryKey: ['customerBalance', businessId] });
      queryClient.invalidateQueries({ queryKey: ['stockSnapshot', businessId] });
      queryClient.invalidateQueries({ queryKey: ['stockMovements', businessId] });
      queryClient.invalidateQueries({ queryKey: ['dailyClosing', businessId] });
    },
  });
}

export function useVoidPurchase() {
  const queryClient = useQueryClient();
  const businessId = getBusinessId();

  return useMutation({
    mutationFn: async (purchaseId: string) => {
      const { businessId: bid, userId, deviceId } = requireAuthContext();
      const db = await getDatabase();
      await db.withTransactionAsync(async () => {
        await voidPurchase({ businessId: bid, purchaseId, userId, deviceId, role: getRole() });
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases', businessId] });
      queryClient.invalidateQueries({ queryKey: ['products', businessId] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats', businessId] });
      queryClient.invalidateQueries({ queryKey: ['payments', businessId] });
      queryClient.invalidateQueries({ queryKey: ['suppliersWithBalances', businessId] });
      queryClient.invalidateQueries({ queryKey: ['supplierBalance', businessId] });
      queryClient.invalidateQueries({ queryKey: ['stockSnapshot', businessId] });
      queryClient.invalidateQueries({ queryKey: ['stockMovements', businessId] });
      queryClient.invalidateQueries({ queryKey: ['dailyClosing', businessId] });
    },
  });
}

export function useAdjustStock() {
  const queryClient = useQueryClient();
  const businessId = getBusinessId();

  return useMutation({
    mutationFn: async (input: { productId: string; kind: StockAdjustmentKind; quantity: number; reason: string }) => {
      const { businessId: bid, userId, deviceId } = requireAuthContext();
      const db = await getDatabase();
      await db.withTransactionAsync(async () => {
        await adjustStock({
          businessId: bid,
          productId: input.productId,
          userId,
          deviceId,
          role: getRole(),
          kind: input.kind,
          quantity: input.quantity,
          reason: input.reason,
        });
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', businessId] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats', businessId] });
      queryClient.invalidateQueries({ queryKey: ['stockSnapshot', businessId] });
      queryClient.invalidateQueries({ queryKey: ['stockMovements', businessId] });
      queryClient.invalidateQueries({ queryKey: ['stockBalance', businessId] });
      queryClient.invalidateQueries({ queryKey: ['dailyClosing', businessId] });
    },
  });
}
