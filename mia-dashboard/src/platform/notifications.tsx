import { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { io, type Socket } from 'socket.io-client';
import { Bell, BellRing, Building2, CheckCheck, CreditCard, Headset, Megaphone, RefreshCw, ShieldAlert, Trash2, Users, Wallet, Wifi, WifiOff, X, type LucideIcon } from 'lucide-react';
import { platformApi, usePlatformToken } from '../lib/platformAuth';
import { AdminButton, AdminPageHeader, EmptyState, ErrorState, FilterSelect, Panel, timeAgo } from './ui/admin';
import { Pager } from '../ui/kit';
import { SkeletonList } from './ui/skeleton';

export type PlatformNotification = {
  id: string; business_id: string | null; category: string; priority: 'low' | 'normal' | 'high' | 'critical'; title: string; message: string;
  action_url: string | null; resource_type: string | null; resource_id: string | null; read_at: string | null; created_at: string;
};
type NotificationPage = { total: number; unread: number; rows: PlatformNotification[] };

export const CATEGORY_META: Record<string, { label: string; icon: LucideIcon; tone: string }> = {
  security: { label: 'Security', icon: ShieldAlert, tone: 'bg-rose-100 text-rose-700' },
  users: { label: 'User management', icon: Users, tone: 'bg-sky-100 text-sky-700' },
  businesses: { label: 'Business management', icon: Building2, tone: 'bg-emerald-100 text-emerald-700' },
  subscriptions: { label: 'Subscriptions', icon: CreditCard, tone: 'bg-violet-100 text-violet-700' },
  payments: { label: 'Payments', icon: Wallet, tone: 'bg-amber-100 text-amber-700' },
  sync: { label: 'Synchronization', icon: RefreshCw, tone: 'bg-orange-100 text-orange-700' },
  operations: { label: 'Platform operations', icon: BellRing, tone: 'bg-slate-100 text-slate-700' },
  announcements: { label: 'Announcements', icon: Megaphone, tone: 'bg-teal-100 text-teal-700' },
  support: { label: 'Support', icon: Headset, tone: 'bg-indigo-100 text-indigo-700' },
};

const UNREAD_KEY = ['platform-notifications-unread'];

export function useRealtimeNotifications() {
  const token = usePlatformToken();
  const client = useQueryClient();
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  useEffect(() => {
    if (!token) return;
    const socket = io(`${import.meta.env.VITE_API_URL}/platform`, {
      path: '/realtime',
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 15000,
    });
    socketRef.current = socket;
    socket.on('connect', () => {
      setConnected(true);
      void client.invalidateQueries({ queryKey: ['platform-notifications'] });
      void client.invalidateQueries({ queryKey: UNREAD_KEY });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));
    socket.on('notification:new', (payload: { notification: PlatformNotification; unread: number }) => {
      client.setQueryData(UNREAD_KEY, payload.unread);
      client.setQueriesData<NotificationPage>({ queryKey: ['platform-notifications'] }, (page) => {
        if (!page || page.rows.some((row) => row.id === payload.notification.id)) return page;
        return { ...page, unread: payload.unread, total: page.total + 1, rows: [payload.notification, ...page.rows] };
      });
      void client.invalidateQueries({ queryKey: ['platform-alert-summary'] });
    });
    socket.on('notification:sync', (payload: { unread: number; ids?: string[]; all?: boolean; removed?: string[]; unread_ids?: string[] }) => {
      client.setQueryData(UNREAD_KEY, payload.unread);
      const now = new Date().toISOString();
      client.setQueriesData<NotificationPage>({ queryKey: ['platform-notifications'] }, (page) => page && ({
        ...page,
        unread: payload.unread,
        rows: page.rows
          .filter((row) => !payload.removed?.includes(row.id))
          .map((row) => payload.all || (payload.ids?.includes(row.id) && !payload.unread_ids?.includes(row.id)) ? { ...row, read_at: row.read_at ?? now } : payload.unread_ids?.includes(row.id) ? { ...row, read_at: null } : row),
      }));
    });
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, client]);
  return { connected };
}

export function useUnreadCount() {
  return useQuery({
    queryKey: UNREAD_KEY,
    queryFn: async () => (await platformApi.get<{ unread: number }>('/notifications/unread-count')).data.unread,
    staleTime: 5 * 60_000,
  });
}

function useNotificationActions() {
  const client = useQueryClient();
  const apply = (unread: number) => client.setQueryData(UNREAD_KEY, unread);
  const markRead = useMutation({
    mutationFn: async (id: string) => (await platformApi.post<{ unread: number }>(`/notifications/${id}/read`)).data,
    onMutate: (id) => client.setQueriesData<NotificationPage>({ queryKey: ['platform-notifications'] }, (page) => page && { ...page, rows: page.rows.map((row) => row.id === id ? { ...row, read_at: row.read_at ?? new Date().toISOString() } : row) }),
    onSuccess: (data) => apply(data.unread),
  });
  const markAll = useMutation({
    mutationFn: async () => (await platformApi.post<{ unread: number }>('/notifications/read-all')).data,
    onSuccess: (data) => {
      apply(data.unread);
      client.setQueriesData<NotificationPage>({ queryKey: ['platform-notifications'] }, (page) => page && { ...page, unread: 0, rows: page.rows.map((row) => ({ ...row, read_at: row.read_at ?? new Date().toISOString() })) });
    },
  });
  const remove = useMutation({
    mutationFn: async ({ id, mode }: { id: string; mode: 'dismiss' | 'delete' }) => (mode === 'delete' ? await platformApi.delete<{ unread: number }>(`/notifications/${id}`) : await platformApi.post<{ unread: number }>(`/notifications/${id}/dismiss`)).data,
    onMutate: ({ id }) => client.setQueriesData<NotificationPage>({ queryKey: ['platform-notifications'] }, (page) => page && { ...page, total: Math.max(0, page.total - 1), rows: page.rows.filter((row) => row.id !== id) }),
    onSuccess: (data) => apply(data.unread),
  });
  return { markRead, markAll, remove };
}

function NotificationRow({ row, onOpen, onDismiss, onDelete, compact = false }: { row: PlatformNotification; onOpen: () => void; onDismiss: () => void; onDelete?: () => void; compact?: boolean }) {
  const meta = CATEGORY_META[row.category] ?? CATEGORY_META.operations;
  const unread = !row.read_at;
  return (
    <li className={`group relative flex gap-3 rounded-xl px-3 py-3 ${unread ? 'bg-brand-soft/50' : ''} hover:bg-slate-50`}>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta.tone}`} title={meta.label}><meta.icon size={16} /></span>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-2">
          <span className={`truncate text-sm ${unread ? 'font-bold' : 'font-semibold'} text-ink`}>{row.title}</span>
          {row.priority === 'critical' || row.priority === 'high' ? <span className={`shrink-0 rounded-full px-1.5 text-[10px] font-bold uppercase ${row.priority === 'critical' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{row.priority}</span> : null}
        </span>
        <span className={`block text-xs text-muted ${compact ? 'line-clamp-2' : ''}`}>{row.message}</span>
        <span className="mt-1 block text-[11px] text-slate-400">{meta.label} · {timeAgo(row.created_at)}</span>
      </button>
      {unread ? <span aria-label="Unread" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" /> : null}
      {onDelete ? <button type="button" aria-label={`Delete ${row.title}`} onClick={onDelete} className="shrink-0 self-center rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-700"><Trash2 size={15} /></button>
        : <button type="button" aria-label={`Dismiss ${row.title}`} onClick={onDismiss} className="absolute right-2 top-2 rounded-md p-1 text-slate-400 opacity-0 hover:bg-white hover:text-ink focus:opacity-100 group-hover:opacity-100"><X size={14} /></button>}
    </li>
  );
}

export function NotificationCenter() {
  const { connected } = useRealtimeNotifications();
  const unread = useUnreadCount();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const list = useQuery({
    queryKey: ['platform-notifications', 'popover'],
    queryFn: async () => (await platformApi.get<NotificationPage>('/notifications', { params: { limit: 8 } })).data,
    enabled: open,
    staleTime: 30_000,
  });
  const { markRead, markAll, remove } = useNotificationActions();
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape); };
  }, [open]);
  const count = unread.data ?? 0;
  const openRow = (row: PlatformNotification) => {
    if (!row.read_at) markRead.mutate(row.id);
    setOpen(false);
    if (row.action_url) navigate(row.action_url);
  };
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label={`Notifications${count ? `, ${count} unread` : ''}`} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((v) => !v)} className="relative flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-slate-100">
        <Bell size={20} />
        {count ? <span className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white ring-2 ring-white">{count > 99 ? '99+' : count}</span> : null}
      </button>
      <span className="sr-only" aria-live="polite">{count ? `${count} unread notifications` : ''}</span>
      {open ? (
        <div role="dialog" aria-label="Notifications" className="fixed inset-x-3 top-[72px] z-40 rounded-2xl border border-line bg-white shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[400px]">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-ink">Notifications</span>
              <span title={connected ? 'Live updates on' : 'Reconnecting for live updates'} className={`inline-flex items-center gap-1 text-[11px] font-medium ${connected ? 'text-emerald-700' : 'text-amber-700'}`}>{connected ? <Wifi size={12} /> : <WifiOff size={12} />}{connected ? 'Live' : 'Offline'}</span>
            </div>
            <button type="button" disabled={!count || markAll.isPending} onClick={() => markAll.mutate()} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand hover:bg-brand-soft disabled:opacity-40"><CheckCheck size={14} />Mark all as read</button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {list.isPending ? <div className="px-2"><SkeletonList rows={4} /></div>
              : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} compact />
                : list.data.rows.length === 0 ? <EmptyState icon={Bell} title="You're all caught up">New activity appears here as it happens.</EmptyState>
                  : <ul className="space-y-1">{list.data.rows.map((row) => <NotificationRow key={row.id} row={row} compact onOpen={() => openRow(row)} onDismiss={() => remove.mutate({ id: row.id, mode: 'dismiss' })} />)}</ul>}
          </div>
          <div className="border-t border-line p-2"><Link to="/platform/notifications" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2 text-center text-sm font-semibold text-brand hover:bg-brand-soft">View all notifications</Link></div>
        </div>
      ) : null}
    </div>
  );
}

export function NotificationsPage() {
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ['platform-notifications', 'page', category, status, page, pageSize],
    queryFn: async () => (await platformApi.get<NotificationPage>('/notifications', { params: { category, status, limit: pageSize, offset: page * pageSize } })).data,
    placeholderData: keepPreviousData,
  });
  const { markRead, markAll, remove } = useNotificationActions();
  const unread = useUnreadCount();
  return (
    <>
      <AdminPageHeader icon={Bell} title="Notifications" subtitle="Everything that needed your attention, kept until you clear it." refreshing={query.isFetching && !query.isPending}
        actions={<AdminButton icon={CheckCheck} disabled={!unread.data || markAll.isPending} onClick={() => markAll.mutate()}>Mark all as read</AdminButton>} />
      <Panel bodyClass="">
        <div className="flex flex-col gap-2 border-b border-line p-4 sm:flex-row">
          <FilterSelect label="Category" value={category} onChange={(v) => { setCategory(v); setPage(0); }} options={[{ value: 'all', label: 'All categories' }, ...Object.entries(CATEGORY_META).map(([value, meta]) => ({ value, label: meta.label }))]} />
          <FilterSelect label="Status" value={status} onChange={(v) => { setStatus(v); setPage(0); }} options={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread only' }]} />
        </div>
        <div className={`p-2 ${query.isFetching && !query.isPending ? 'opacity-60' : ''}`}>
          {query.isPending ? <div className="px-3"><SkeletonList rows={8} /></div>
            : query.isError ? <ErrorState error={query.error} onRetry={() => query.refetch()} />
              : query.data.rows.length === 0 ? <EmptyState icon={Bell} title="No notifications">Nothing matches these filters.</EmptyState>
                : (
                  <ul className="space-y-1">
                    {query.data.rows.map((row) => (
                      <NotificationRow key={row.id} row={row} onOpen={() => { if (!row.read_at) markRead.mutate(row.id); if (row.action_url) navigate(row.action_url); }} onDismiss={() => remove.mutate({ id: row.id, mode: 'dismiss' })} onDelete={() => remove.mutate({ id: row.id, mode: 'delete' })} />
                    ))}
                  </ul>
                )}
        </div>
        <Pager page={page} pageSize={pageSize} total={query.data?.total ?? 0} onPage={setPage} onPageSize={(size) => { setPageSize(size); setPage(0); }} noun="notifications" busy={query.isFetching && !query.isPending} />
      </Panel>
    </>
  );
}
