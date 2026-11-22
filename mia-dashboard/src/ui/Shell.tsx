import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, Home, LogOut, Menu, Search, X, type LucideIcon } from 'lucide-react';

export type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean };
export type NavGroup = { label: string; items: NavItem[] };

function initialsOf(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '?';
}

export function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) close(); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [open, close]);
  return ref;
}

function findActive(groups: NavGroup[], pathname: string) {
  for (const group of groups) {
    const item = group.items.find((entry) => (entry.end || entry.to === '/' ? pathname === entry.to : pathname === entry.to || pathname.startsWith(`${entry.to}/`)));
    if (item) return { group, item };
  }
  return null;
}

function Breadcrumbs({ groups }: { groups: NavGroup[] }) {
  const { pathname } = useLocation();
  const active = findActive(groups, pathname);
  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 md:block">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        <li className="flex items-center">
          <Link to="/" aria-label="Home" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-ink"><Home size={15} /></Link>
        </li>
        {active ? (
          <>
            <li className="flex items-center gap-1.5 whitespace-nowrap text-muted"><ChevronRight size={14} className="text-slate-300" aria-hidden />{active.group.label}</li>
            <li className="flex min-w-0 items-center gap-1.5"><ChevronRight size={14} className="shrink-0 text-slate-300" aria-hidden /><span aria-current="page" className="truncate font-semibold text-ink">{active.item.label}</span></li>
          </>
        ) : null}
      </ol>
    </nav>
  );
}

function PageSearch({ groups }: { groups: NavGroup[] }) {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const ref = useOutsideClose(open, () => setOpen(false));
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        ref.current?.querySelector('input')?.focus();
      }
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, [ref]);
  const results = useMemo(() => {
    const needle = term.trim().toLowerCase();
    const all = groups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label })));
    return needle ? all.filter((item) => item.label.toLowerCase().includes(needle) || item.group.toLowerCase().includes(needle)) : all;
  }, [groups, term]);
  const go = (to: string) => { setOpen(false); setTerm(''); navigate(to); };
  return (
    <div ref={ref} className="relative hidden w-full max-w-xs sm:block lg:max-w-sm">
      <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
      <input
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls="page-search-results"
        aria-label="Search pages"
        placeholder="Search pages and features…"
        value={term}
        onChange={(e) => { setTerm(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(results.length - 1, i + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
          if (e.key === 'Enter' && results[active]) go(results[active].to);
        }}
        className="h-10 w-full rounded-full border border-line bg-canvas pl-10 pr-12 text-sm text-ink placeholder:text-slate-400 focus:border-brand focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand/20"
      />
      {term ? null : <kbd className="pointer-events-none absolute right-3.5 top-1/2 hidden -translate-y-1/2 rounded border border-line bg-white px-1.5 text-[10px] font-semibold text-muted lg:block">⌘K</kbd>}
      {open ? (
        <div id="page-search-results" role="listbox" className="absolute left-0 right-0 z-40 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-line bg-white p-1.5 shadow-xl">
          {results.length === 0 ? <p className="px-3 py-4 text-sm text-muted">No page matches “{term.trim()}”.</p> : results.map((item, index) => (
            <button key={item.to} type="button" role="option" aria-selected={index === active} onMouseEnter={() => setActive(index)} onClick={() => go(item.to)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${index === active ? 'bg-slate-100' : ''}`}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand"><item.icon size={16} aria-hidden /></span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{item.label}</span>
              <span className="text-[11px] font-semibold uppercase text-muted">{item.group}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ProfileMenu({ userName, userSub, userEmail, onSignOut }: { userName: string; userSub: string; userEmail?: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`Account menu for ${userName}`} onClick={() => setOpen((v) => !v)} className="flex items-center gap-2.5 rounded-full p-0.5 hover:bg-slate-100 xl:pr-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0e3b36] text-sm font-bold text-white">{initialsOf(userName)}</span>
        <span className="hidden text-left xl:block"><span className="block max-w-[10rem] truncate text-sm font-semibold leading-tight text-ink">{userName}</span><span className="block text-xs text-muted">{userSub}</span></span>
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-64 rounded-2xl border border-line bg-white p-1.5 shadow-xl">
          <div className="border-b border-line px-3 pb-3 pt-2">
            <div className="truncate text-sm font-semibold text-ink">{userName}</div>
            {userEmail ? <div className="truncate text-xs text-muted">{userEmail}</div> : null}
            <div className="mt-1.5 inline-flex rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand">{userSub}</div>
          </div>
          <button role="menuitem" type="button" onClick={onSignOut} className="mt-1.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-700 hover:bg-rose-50"><LogOut size={15} aria-hidden />Sign out</button>
        </div>
      ) : null}
    </div>
  );
}

export function Shell({ brand, brandSub, groups, userName, userSub, userEmail, onSignOut, sidebarClass, activeClass, inactiveClass, banner, headerActions }: {
  brand: string;
  brandSub: string;
  groups: NavGroup[];
  userName: string;
  userSub: string;
  userEmail?: string;
  onSignOut: () => void;
  sidebarClass: string;
  activeClass: string;
  inactiveClass: string;
  banner?: ReactNode;
  headerActions?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-[#f8fafb] text-slate-800 font-sans antialiased">
      {open ? <button aria-label="Close menu" className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setOpen(false)} /> : null}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'} ${sidebarClass}`}>
        <div className="flex items-center justify-between gap-2 px-5 pt-6 pb-5">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-end justify-center gap-[3px] rounded-xl bg-emerald-500/15 pb-2">
              <span className="h-2 w-[4px] rounded-sm bg-emerald-400" /><span className="h-3.5 w-[4px] rounded-sm bg-emerald-400" /><span className="h-5 w-[4px] rounded-sm bg-emerald-300" />
            </span>
            <div className="min-w-0">
              <div className="truncate text-[15px] font-extrabold tracking-tight leading-tight">{brand}</div>
              <div className="mt-0.5 truncate text-[11px] opacity-70 font-medium">{brandSub}</div>
            </div>
          </div>
          <button aria-label="Close menu" className="lg:hidden p-1 opacity-70" onClick={() => setOpen(false)}><X size={18} /></button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-5">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider opacity-60">{group.label}</div>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) => `flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${isActive ? activeClass : inactiveClass}`}
                  >
                    <item.icon size={16} />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="flex items-center gap-3 border-t border-white/10 p-4">
          <div aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-bold">{initialsOf(userName)}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{userName}</div>
            <div className="truncate text-[11px] opacity-70">{userSub}</div>
          </div>
          <button onClick={onSignOut} aria-label="Sign out" title="Sign out" className="rounded-lg p-2 opacity-80 hover:bg-white/10 hover:opacity-100"><LogOut size={16} /></button>
        </div>
      </aside>
      <div className="lg:ml-[260px] min-w-0">
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-8">
            <button aria-label="Open menu" onClick={() => setOpen(true)} className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 lg:hidden"><Menu size={22} /></button>
            <span className="min-w-0 truncate font-extrabold text-slate-900 md:hidden">{brand}</span>
            <Breadcrumbs groups={groups} />
            <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-3">
              <PageSearch groups={groups} />
              {headerActions}
              <ProfileMenu userName={userName} userSub={userSub} userEmail={userEmail} onSignOut={onSignOut} />
            </div>
          </div>
        </header>
        {banner}
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
