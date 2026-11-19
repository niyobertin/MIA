import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { platformApi } from '../../lib/platformAuth';
import { useDebounced, type SortState } from './admin';

export type ListResponse<T, S = Record<string, number>> = { total: number; rows: T[]; summary?: S };

export function useServerList<T, S = Record<string, number>>({ key, path, filters, defaultSort, pageSize: initialSize = 25, enabled = true }: {
  key: string;
  path: string;
  filters: Record<string, string | undefined>;
  defaultSort: SortState;
  pageSize?: number;
  enabled?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>(defaultSort);
  const [pageSize, setPageSize] = useState(initialSize);
  const debounced = useDebounced(search.trim(), 300);
  const filterKey = JSON.stringify({ filters, debounced, sort, pageSize });
  const [paging, setPaging] = useState({ key: filterKey, page: 0 });
  const page = paging.key === filterKey ? paging.page : 0;
  const params = Object.fromEntries(Object.entries({ ...filters, q: debounced || undefined, sort_by: sort.by, sort: sort.dir, limit: String(pageSize), offset: String(page * pageSize) }).filter(([, value]) => value !== undefined && value !== '' && value !== 'all'));
  const query = useQuery({
    queryKey: [key, path, params],
    queryFn: async () => (await platformApi.get<ListResponse<T, S>>(path, { params })).data,
    placeholderData: keepPreviousData,
    enabled,
  });
  return {
    query,
    search,
    setSearch,
    sort,
    setSort,
    page,
    setPage: (next: number) => setPaging({ key: filterKey, page: next }),
    pageSize,
    setPageSize,
    tableProps: {
      rows: query.data?.rows,
      loading: query.isPending,
      fetching: query.isFetching,
      error: query.isError ? query.error : undefined,
      onRetry: () => void query.refetch(),
      sort,
      onSort: setSort,
      page,
      pageSize,
      total: query.data?.total ?? 0,
      onPage: (next: number) => setPaging({ key: filterKey, page: next }),
      onPageSize: setPageSize,
    },
  };
}
