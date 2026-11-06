import { useState, type ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LogOut, Menu, X, type LucideIcon } from 'lucide-react';

export type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean };
export type NavGroup = { label: string; items: NavItem[] };

export function Shell({ brand, brandSub, groups, userName, userSub, onSignOut, sidebarClass, activeClass, inactiveClass, banner }: {
  brand: string;
  brandSub: string;
  groups: NavGroup[];
  userName: string;
  userSub: string;
  onSignOut: () => void;
  sidebarClass: string;
  activeClass: string;
  inactiveClass: string;
  banner?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const initials = userName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
  return (
    <div className="min-h-screen bg-[#f8fafb] text-slate-800 font-sans antialiased">
      {open ? <button aria-label="Close menu" className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setOpen(false)} /> : null}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'} ${sidebarClass}`}>
        <div className="flex items-center justify-between px-6 pt-7 pb-5">
          <div>
            <div className="text-[15px] font-extrabold tracking-tight leading-none">{brand}</div>
            <div className="mt-1 text-[11px] opacity-70 font-medium">{brandSub}</div>
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
                    className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive ? activeClass : inactiveClass}`}
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
          <div aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-bold">{initials}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{userName}</div>
            <div className="truncate text-[11px] opacity-70">{userSub}</div>
          </div>
          <button onClick={onSignOut} aria-label="Sign out" title="Sign out" className="rounded-lg p-2 opacity-80 hover:bg-white/10 hover:opacity-100"><LogOut size={16} /></button>
        </div>
      </aside>
      <div className="lg:ml-[260px] min-w-0">
        <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <button aria-label="Open menu" onClick={() => setOpen(true)} className="p-1 text-slate-700"><Menu size={22} /></button>
          <span className="font-extrabold text-slate-900">{brand}</span>
        </div>
        {banner}
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
