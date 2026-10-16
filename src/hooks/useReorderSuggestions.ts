import React from 'react';
import { useLowStockProducts, useSuppliers } from '@/hooks/useData';
import { suggestedReorderQty } from '@/services/financial/calculations';

export interface ReorderSuggestion {
  id: string;
  name: string;
  unit: string;
  onHand: number;
  reorderLevel: number;
  suggested: number;
  estCost: number;
  supplierName: string | null;
  out: boolean;
}

export function useReorderSuggestions() {
  const lowStockQuery = useLowStockProducts();
  const suppliersQuery = useSuppliers();
  const lowStock = lowStockQuery.data;
  const suppliers = suppliersQuery.data;

  const rows = React.useMemo<ReorderSuggestion[]>(() => {
    const bySupplier = new Map((suppliers ?? []).map((s) => [s.id, s.name]));
    return (lowStock ?? [])
      .map((p) => {
        const onHand = p.current_stock ?? 0;
        const suggested = suggestedReorderQty(onHand, p.reorder_level);
        return {
          id: p.id,
          name: p.name,
          unit: p.unit,
          onHand,
          reorderLevel: p.reorder_level,
          suggested,
          estCost: suggested * (p.average_cost ?? 0),
          supplierName: (p.preferred_supplier_id && bySupplier.get(p.preferred_supplier_id)) || null,
          out: onHand <= 0,
        };
      })
      .filter((r) => r.suggested > 0 || r.out)
      .sort((a, b) => Number(b.out) - Number(a.out));
  }, [lowStock, suppliers]);

  const totalCost = React.useMemo(() => rows.reduce((sum, r) => sum + r.estCost, 0), [rows]);
  const outCount = React.useMemo(() => rows.filter((r) => r.out).length, [rows]);

  const refetch = React.useCallback(
    () => Promise.all([lowStockQuery.refetch(), suppliersQuery.refetch()]),
    [lowStockQuery, suppliersQuery]
  );

  return {
    rows,
    totalCost,
    outCount,
    isLoading: lowStockQuery.isLoading,
    isRefetching: lowStockQuery.isRefetching,
    refetch,
  };
}
