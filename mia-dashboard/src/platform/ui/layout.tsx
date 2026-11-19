import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Building2, ChevronRight, CreditCard, KeyRound, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search, ShieldCheck, User, Users, X, type LucideIcon } from 'lucide-react';
import { platformApi, signOutPlatform } from '../../lib/platformAuth';
import { useAdmin } from '../context';
import { NotificationCenter } from '../notifications';
import { initials, useAlertSummary, useDebounced } from './admin';

export type PlatformNavItem = { to: string; label: string; icon: LucideIcon; end?: boolean; badge?: 'alerts' };
export type PlatformNavGroup = { label: string; items: PlatformNavItem[] };

const ROLE_LABELS: Record<string, string> = { SUPER_ADMIN: 'Super admin', SUPPORT: 'Support', FINANCE: 'Finance' };

type Crumb = { label: string; to?: string };
const CrumbContext = createContext<(crumbs: Crumb[] | null) => void>(() => undefined);

export function useBreadcrumbs(crumbs: Crumb[] | null) {
  const set = useContext(CrumbContext);
  const key = JSON.stringify(crumbs);
  useEffect(() => {
    set(crumbs);
    return () => set(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, set]);
}

function readCollapsed() {
  try {
    return localStorage.getItem('mia.platform.sidebar') === 'collapsed';
  } catch {
    return false;
  }
}

function Sidebar({ groups, collapsed, open, onClose }: { groups: PlatformNavGroup[]; collapsed: boolean; open: boolean; onClose: () => void }) {
  const admin = useAdmin();
  const alerts = useAlertSummary();
  const alertCount = alerts.data?.count ?? 0;
  return (
    <aside aria-label="Main navigation" className={`fixed inset-y-0 left-0 z-40 flex flex-col bg-navy text-slate-100 transition-[transform,width] duration-200 motion-reduce:transition-none ${collapsed ? 'lg:w-[84px]' : 'lg:w-[260px]'} w-[272px] ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
      <div className={`flex items-center justify-between gap-2 px-5 pb-6 pt-6 ${collapsed ? 'lg:justify-center lg:px-3' : ''}`}>
        <Link to="/platform" className="flex min-w-0 items-center gap-3" onClick={onClose}>
          <img src="/mia.png" alt="" className="h-11 w-11 shrink-0 rounded-xl bg-white object-contain p-0.5" />
          <span className={`min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
            <span className="block text-lg font-extrabold leading-tight tracking-tight">MIA Platform</span>
            <span className="block text-xs font-medium text-slate-300">Super Admin Console</span>
          </span>
        </Link>
        <button type="button" aria-label="Close menu" className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 lg:hidden" onClick={onClose}><X size={18} /></button>
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-6">
        {groups.map((group) => (
          <div key={group.label}>
            <div className={`px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400 ${collapsed ? 'lg:sr-only' : ''}`}>{group.label}</div>
            <div className="space-y-1">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={onClose}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) => `relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${collapsed ? 'lg:justify-center' : ''} ${isActive ? 'bg-brand text-white shadow-[0_4px_14px_rgba(21,155,105,0.35)]' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
                >
                  <item.icon size={19} className="shrink-0" />
                  <span className={`truncate ${collapsed ? 'lg:sr-only' : ''}`}>{item.label}</span>
                  {item.badge === 'alerts' && alertCount > 0 ? (
                    <span aria-label={`${alertCount} alerts`} className={`ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white ${collapsed ? 'lg:absolute lg:right-1.5 lg:top-1' : ''}`}>{alertCount}</span>
                  ) : null}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className={`flex items-center gap-3 border-t border-white/10 p-4 ${collapsed ? 'lg:flex-col' : ''}`}>
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-bold">{initials(admin.name)}</span>
        <span className={`min-w-0 flex-1 ${collapsed ? 'lg:hidden' : ''}`}>
          <span className="block truncate text-sm font-semibold">{admin.name}</span>
          <span className="block truncate text-xs text-slate-400">{ROLE_LABELS[admin.role] ?? admin.role}</span>
        </span>
        <button type="button" onClick={signOutPlatform} aria-label="Sign out" title="Sign out" className="rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white"><LogOut size={18} /></button>
      </div>
    </aside>
  );
}

type SearchResult = { type: 'business' | 'user' | 'subscription'; id: string; title: string; subtitle: string | null; link: string };
const RESULT_ICONS: Record<SearchResult['type'], LucideIcon> = { business: Building2, user: Users, subscription: CreditCard };

function GlobalSearch() {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const debounced = useDebounced(term.trim(), 250);
  const query = useQuery({
    queryKey: ['platform-search', debounced],
    queryFn: async () => (await platformApi.get<{ results: SearchResult[] }>('/search', { params: { q: debounced } })).data.results,
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  });
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        ref.current?.querySelector('input')?.focus();
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', shortcut);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', shortcut); };
  }, []);
  const results = query.data ?? [];
  const go = (result: SearchResult) => { setOpen(false); setTerm(''); navigate(result.link); };
  return (
    <div ref={ref} className="relative w-full max-w-md">
      <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        role="combobox"
        aria-expanded={open && debounced.length >= 2}
        aria-controls="global-search-results"
        aria-label="Search businesses, users and subscriptions"
        placeholder="Search businesses, users, subscriptions…"
        value={term}
        onChange={(e) => { setTerm(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(results.length - 1, i + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
          if (e.key === 'Enter' && results[active]) go(results[active]);
          if (e.key === 'Escape') setOpen(false);
        }}
        className="h-11 w-full rounded-full border border-line bg-canvas pl-10 pr-14 text-sm text-ink placeholder:text-slate-400 focus:border-brand focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand/20"
      />
      <kbd className="pointer-events-none absolute right-3.5 top-1/2 hidden -translate-y-1/2 rounded border border-line bg-white px-1.5 text-[10px] font-semibold text-muted md:block">⌘K</kbd>
      {open && debounced.length >= 2 ? (
        <div id="global-search-results" role="listbox" className="absolute left-0 right-0 z-40 mt-2 max-h-96 overflow-y-auto rounded-2xl border border-line bg-white p-1.5 shadow-xl">
          {query.isPending ? <div className="space-y-2 p-2">{[0, 1, 2].map((i) => <span key={i} className="skeleton block h-10 rounded-lg" />)}</div>
            : query.isError ? <p className="px-3 py-4 text-sm text-rose-700">Search is unavailable right now.</p>
              : results.length === 0 ? <p className="px-3 py-4 text-sm text-muted">No matches for “{debounced}”.</p>
                : results.map((result, index) => {
                  const Icon = RESULT_ICONS[result.type];
                  return (
                    <button key={`${result.type}-${result.id}`} type="button" role="option" aria-selected={index === active} onMouseEnter={() => setActive(index)} onClick={() => go(result)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${index === active ? 'bg-slate-100' : ''}`}>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand"><Icon size={16} /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{result.title}</span><span className="block truncate text-xs text-muted">{result.subtitle}</span></span>
                      <span className="text-[11px] font-semibold uppercase text-muted">{result.type}</span>
                    </button>
                  );
                })}
        </div>
      ) : null}
    </div>
  );
}

function ProfileMenu({ onChangePassword }: { onChangePassword: () => void }) {
  const admin = useAdmin();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`Account menu for ${admin.name}`} onClick={() => setOpen((v) => !v)} className="flex items-center gap-2.5 rounded-full p-0.5 pr-1 hover:bg-slate-100 lg:pr-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">{initials(admin.name)}</span>
        <span className="hidden text-left lg:block"><span className="block text-sm font-semibold leading-tight text-ink">{admin.name}</span><span className="block text-xs text-muted">{ROLE_LABELS[admin.role] ?? admin.role}</span></span>
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-64 rounded-2xl border border-line bg-white p-1.5 shadow-xl">
          <div className="border-b border-line px-3 pb-3 pt-2">
            <div className="truncate text-sm font-semibold text-ink">{admin.name}</div>
            <div className="truncate text-xs text-muted">{admin.email}</div>
            <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand"><ShieldCheck size={12} />{ROLE_LABELS[admin.role]}</div>
          </div>
          <div className="pt-1.5">
            <div role="menuitem" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted"><User size={15} />Two-factor sign-in: {admin.two_factor === 'email' ? 'email code' : 'off'}</div>
            <button role="menuitem" type="button" onClick={() => { setOpen(false); onChangePassword(); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-ink hover:bg-slate-50"><KeyRound size={15} />Change password</button>
            <button role="menuitem" type="button" onClick={signOutPlatform} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-700 hover:bg-rose-50"><LogOut size={15} />Sign out</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Breadcrumbs({ groups, extra }: { groups: PlatformNavGroup[]; extra: Crumb[] | null }) {
  const location = useLocation();
  const crumbs = useMemo(() => {
    const items = groups.flatMap((group) => group.items);
    const match = [...items].sort((a, b) => b.to.length - a.to.length).find((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)));
    const list: Crumb[] = [{ label: 'Platform', to: '/platform' }];
    if (match && match.to !== '/platform') list.push({ label: match.label, to: match.to });
    if (match?.to === '/platform') list.push({ label: match.label });
    return [...list, ...(extra ?? [])];
  }, [groups, extra, location.pathname]);
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-sm">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className={`flex min-w-0 items-center gap-1 ${index < crumbs.length - 2 ? 'hidden sm:flex' : ''}`}>
              {index > 0 ? <ChevronRight size={14} className="shrink-0 text-slate-300" /> : null}
              {crumb.to && !last
                ? <Link to={crumb.to} className="truncate font-medium text-muted hover:text-ink">{crumb.label}</Link>
                : <span aria-current={last ? 'page' : undefined} className="truncate font-semibold text-ink">{crumb.label}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function PlatformShell({ groups, onChangePassword, banner }: { groups: PlatformNavGroup[]; onChangePassword: () => void; banner?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [crumbs, setCrumbs] = useState<Crumb[] | null>(null);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  const toggleCollapsed = () => {
    setCollapsed((value) => {
      try { localStorage.setItem('mia.platform.sidebar', value ? 'open' : 'collapsed'); } catch { /* per-viewer convenience only */ }
      return !value;
    });
  };
  return (
    <CrumbContext.Provider value={setCrumbs}>
      <div className="min-h-screen bg-canvas font-sans text-ink antialiased">
        <a href="#platform-main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow">Skip to content</a>
        {open ? <button type="button" aria-label="Close menu" className="fixed inset-0 z-30 bg-navy/40 lg:hidden" onClick={() => setOpen(false)} /> : null}
        <Sidebar groups={groups} collapsed={collapsed} open={open} onClose={() => setOpen(false)} />
        <div className={`min-w-0 transition-[margin] duration-200 motion-reduce:transition-none ${collapsed ? 'lg:ml-[84px]' : 'lg:ml-[260px]'}`}>
          <header className="sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur">
            <div className="flex h-[68px] items-center gap-3 px-4 sm:px-6">
              <button type="button" aria-label="Open menu" onClick={() => setOpen(true)} className="rounded-lg p-2 text-ink hover:bg-slate-100 lg:hidden"><Menu size={20} /></button>
              <button type="button" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={toggleCollapsed} className="hidden rounded-lg p-2 text-muted hover:bg-slate-100 hover:text-ink lg:block">{collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}</button>
              <div className="min-w-0 flex-1 md:flex-none md:basis-56 xl:basis-72"><Breadcrumbs groups={groups} extra={crumbs} /></div>
              <div className="hidden flex-1 justify-center md:flex"><GlobalSearch /></div>
              <div className="ml-auto flex items-center gap-2">
                <MobileSearch />
                <NotificationCenter />
                <ProfileMenu onChangePassword={onChangePassword} />
              </div>
            </div>
          </header>
          {banner}
          <main id="platform-main" className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <Outlet />
          </main>
        </div>
      </div>
    </CrumbContext.Provider>
  );
}

function MobileSearch() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-label="Search" onClick={() => setOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-slate-100 md:hidden"><Search size={19} /></button>
      {open ? (
        <div className="fixed inset-0 z-50 bg-navy/40 p-4 md:hidden" role="dialog" aria-modal="true" aria-label="Search">
          <div className="rounded-2xl bg-white p-3 shadow-xl">
            <div className="mb-2 flex justify-end"><button type="button" aria-label="Close search" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-muted"><X size={18} /></button></div>
            <GlobalSearch />
          </div>
        </div>
      ) : null}
    </>
  );
}
