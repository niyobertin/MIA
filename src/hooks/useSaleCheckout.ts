import React from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useCreateSale, useIssueWaiterTab } from '@/hooks/useData';
import { useSalesStore } from '@/stores/salesStore';
import { useAuthStore } from '@/stores/authStore';
import { showToast } from '@/stores/toastStore';
import { User } from '@/types';

export type PayMethod = 'cash' | 'mobile_money' | 'bank' | 'credit';
export type CheckoutMode = 'sale' | 'waiter';

export type SaleSuccess = {
  total: number;
  profit: number;
  paymentMethod: string;
  lines: { name: string; qty: number; price: number; before: number | null; after: number | null }[];
};

export function useSaleCheckout({
  onNeedCustomer,
  onNeedWaiter,
}: {
  onNeedCustomer: () => void;
  onNeedWaiter: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const createSaleMutation = useCreateSale();
  const issueWaiterMutation = useIssueWaiterTab();
  const { cart, customerId, paymentMethod, clearCart, getTotal } = useSalesStore();

  const [mode, setMode] = React.useState<CheckoutMode>('sale');
  const [waiter, setWaiter] = React.useState<User | null>(null);
  const [clientLabel, setClientLabel] = React.useState('');
  const [success, setSuccess] = React.useState<SaleSuccess | null>(null);
  const [belowCostWarning, setBelowCostWarning] = React.useState<{ shortfall: number; product?: string } | null>(null);

  const canOverridePrice = user?.role === 'OWNER' || user?.role === 'MANAGER';

  const cartProfit = React.useMemo(
    () =>
      cart.reduce((sum, item) => {
        const cost = item.product.average_cost ?? 0;
        return sum + item.sellingPrice * item.quantity - item.discountAmount - cost * item.quantity;
      }, 0),
    [cart]
  );

  const hasBelowCostLine = cart.some((item) => {
    const cost = item.product.track_inventory ? (item.product.average_cost ?? 0) : 0;
    if (cost <= 0 || item.quantity <= 0) return false;
    return Math.round((item.quantity * item.sellingPrice - item.discountAmount) / item.quantity) < cost;
  });

  const resetMode = () => {
    setMode('sale');
    setWaiter(null);
    setClientLabel('');
  };

  const attempt = React.useRef<{ method: PayMethod; customerId: string | null }>({
    method: 'cash',
    customerId: null,
  });

  const submitSale = async (allowBelowCost: boolean) => {
    await createSaleMutation.mutateAsync({
      customerId: attempt.current.customerId,
      items: cart.map((item) => ({
        productId: item.product.id,
        quantity: item.quantity,
        sellingPrice: item.sellingPrice,
        discountAmount: item.discountAmount,
        taxAmount: item.taxAmount,
      })),
      paymentMethod: attempt.current.method,
      notes: undefined,
      allowBelowCost,
    });
  };

  const finishSale = () => {
    setSuccess({
      total: getTotal(),
      profit: cartProfit,
      paymentMethod: attempt.current.method,
      lines: cart.map((item) => {
        const before = item.product.current_stock ?? null;
        return {
          name: item.product.name,
          qty: item.quantity,
          price: item.sellingPrice,
          before,
          after: before !== null ? before - item.quantity : null,
        };
      }),
    });
    clearCart();
  };

  const issueToWaiter = async (): Promise<boolean> => {
    if (!waiter) {
      showToast(t('sales.waiterRequired'), 'error');
      onNeedWaiter();
      return false;
    }
    try {
      const issued = await issueWaiterMutation.mutateAsync({
        waiterUserId: waiter.id,
        clientLabel: clientLabel.trim() || undefined,
        lines: cart.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          sellingPrice: item.sellingPrice,
        })),
      });
      clearCart();
      resetMode();
      showToast(
        issued.joinedExisting
          ? t('waiterTabs.addedToOpenTab', { name: waiter.name })
          : t('sales.issuedToWaiter'),
        'success'
      );
      router.push(`/waiter-tabs/${issued.id}`);
      return true;
    } catch {
      showToast(t('sales.issueToWaiterFailed'), 'error');
      return false;
    }
  };

  const confirm = async (override?: { method?: PayMethod; customerId?: string | null }): Promise<boolean> => {
    if (mode === 'waiter') return issueToWaiter();
    const method = override?.method ?? (paymentMethod as PayMethod);
    const buyer = override?.customerId !== undefined ? override.customerId : customerId;
    attempt.current = { method, customerId: buyer };
    if (method === 'credit' && !buyer) {
      showToast(t('sales.customerRequired'), 'error');
      onNeedCustomer();
      return false;
    }
    try {
      await submitSale(false);
      finishSale();
      return true;
    } catch (error) {
      console.error('Sale failed:', error);
      const code = error instanceof Error ? error.message : '';
      const productName = error instanceof Error ? (error as Error & { productName?: string }).productName : undefined;
      if (code === 'INSUFFICIENT_STOCK') {
        showToast(t('sales.insufficientStock', { product: productName ?? '' }), 'error');
      } else if (code === 'DAY_CLOSED') {
        showToast(t('cash.dayAlreadyClosed'), 'error');
      } else if (code === 'CREDIT_LIMIT') {
        showToast(t('sales.creditLimit'), 'error');
      } else if (code === 'INVALID_PRICE') {
        showToast(t('sales.priceRequired'), 'error');
      } else if (code === 'CUSTOMER_REQUIRED') {
        showToast(t('sales.customerRequired'), 'error');
        onNeedCustomer();
      } else if (code === 'BELOW_COST') {
        const shortfall = (error as Error & { shortfall?: number }).shortfall ?? 0;
        if (canOverridePrice) {
          setBelowCostWarning({ shortfall, product: productName });
        } else {
          showToast(t('sales.belowCostBlocked', { amount: `${shortfall.toLocaleString()} RWF` }), 'error');
        }
      } else {
        showToast(t('sales.saleFailed'), 'error');
      }
      return false;
    }
  };

  const confirmBelowCost = async (): Promise<boolean> => {
    const warn = belowCostWarning;
    setBelowCostWarning(null);
    if (!warn) return false;
    try {
      await submitSale(true);
      finishSale();
      return true;
    } catch {
      showToast(t('sales.saleFailed'), 'error');
      return false;
    }
  };

  return {
    mode,
    setMode,
    waiter,
    setWaiter,
    clientLabel,
    setClientLabel,
    resetMode,
    cartProfit,
    hasBelowCostLine,
    confirm,
    confirmBelowCost,
    belowCostWarning,
    dismissBelowCost: () => setBelowCostWarning(null),
    success,
    closeSuccess: () => setSuccess(null),
    saving: mode === 'waiter' ? issueWaiterMutation.isPending : createSaleMutation.isPending,
    savingSale: createSaleMutation.isPending,
  };
}
