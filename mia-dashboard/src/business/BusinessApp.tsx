import { createContext, useContext, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { CalendarClock, FileText, LayoutDashboard, PackageSearch, PlusCircle, Settings, ShoppingCart, Users, Wallet, type LucideIcon } from 'lucide-react';
import { signOut, type Session } from '../lib/auth';
import { Shell, type NavGroup } from '../ui/Shell';
import { Button, ErrorNotice } from '../ui/kit';
import { AppShellSkeleton } from '../ui/skeleton';
import { AnnouncementBanner } from '../ui/AnnouncementBanner';
import { useMe, type Me } from './useMe';
import { BusinessHeaderActions } from './HeaderActions';
import { Overview } from './Overview';
import { Customers, Expenses, Movements, Payments, Products, Purchases, Sales, StockReport } from './tables';
import { Activity, BusinessSettings, Reports, Staff } from './manage';
import { NewSale } from './pos';
import { DayPage } from './day';
import { Suppliers } from './suppliers';
import { WaiterTabs } from './waiter';

type ModulePage = { to: string; label: string; permission: string; flag?: string };
type Module = { key: string; group: string; label: string; icon: LucideIcon; pages: ModulePage[] };

const MODULES: Module[] = [
  { key: 'home', group: 'Daily', label: 'Dashboard', icon: LayoutDashboard, pages: [
    { to: '/', label: 'Dashboard', permission: 'overview' },
  ] },
  { key: 'new-sale', group: 'Daily', label: 'New sale', icon: PlusCircle, pages: [
    { to: '/new-sale', label: 'New sale', permission: 'salesCreate' },
  ] },
  { key: 'day', group: 'Daily', label: 'Day & cash', icon: CalendarClock, pages: [
    { to: '/day', label: 'Day & cash', permission: 'sales' },
  ] },
  { key: 'sales', group: 'Business', label: 'Sales', icon: ShoppingCart, pages: [
    { to: '/sales', label: 'All sales', permission: 'sales' },
    { to: '/unpaid', label: 'Unpaid', permission: 'sales' },
    { to: '/waiter-tabs', label: 'Waiter tabs', permission: 'waiterTabs' },
  ] },
  { key: 'money', group: 'Business', label: 'Expenses & payments', icon: Wallet, pages: [
    { to: '/expenses', label: 'Expenses', permission: 'expenses' },
    { to: '/payments', label: 'Payments', permission: 'payments' },
  ] },
  { key: 'stock', group: 'Business', label: 'Stock', icon: PackageSearch, pages: [
    { to: '/products', label: 'Products', permission: 'products' },
    { to: '/stock-in', label: 'Stock-in', permission: 'purchases' },
    { to: '/movements', label: 'Movements', permission: 'movements' },
    { to: '/stock-report', label: 'Stock report', permission: 'stockReport', flag: 'stock_reports' },
  ] },
  { key: 'contacts', group: 'Business', label: 'Customers & suppliers', icon: Users, pages: [
    { to: '/customers', label: 'Customers', permission: 'customers' },
    { to: '/suppliers', label: 'Suppliers', permission: 'suppliers' },
  ] },
  { key: 'reports', group: 'Business', label: 'Reports', icon: FileText, pages: [
    { to: '/reports', label: 'Reports', permission: 'reports' },
  ] },
  { key: 'settings', group: 'Admin', label: 'Settings', icon: Settings, pages: [
    { to: '/settings', label: 'Business', permission: 'products' },
    { to: '/staff', label: 'Staff & roles', permission: 'staff' },
    { to: '/activity', label: 'Activity log', permission: 'audit' },
  ] },
];

const MODULE_BY_KEY = Object.fromEntries(MODULES.map((module) => [module.key, module]));

function canOpen(me: Me, page: ModulePage) {
  return me.permissions.includes(page.permission) && (!page.flag || Boolean(me.flags[page.flag]));
}

const MeContext = createContext<Me | null>(null);

const ROLE_LABELS: Record<string, string> = { OWNER: 'Owner', MANAGER: 'Manager', CASHIER: 'Cashier', STAFF: 'Staff' };

export function useDashboard() {
  return useContext(MeContext) as Me;
}

function Guard({ permission, flag }: { permission: string; flag?: string }) {
  const me = useDashboard();
  if (!me.permissions.includes(permission) || (flag && !me.flags[flag])) return <Navigate to="/" replace />;
  return <Outlet />;
}

function Home() {
  const me = useDashboard();
  if (me.permissions.includes('overview')) return <Overview />;
  return <Navigate to={me.permissions.includes('sales') ? '/sales' : '/products'} replace />;
}

export default function BusinessApp({ session }: { session: Session }) {
  const me = useMe(session.user.id);

  if (me.isLoading) return <AppShellSkeleton />;
  if (me.isError || !me.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8fafb] p-4">
        <div className="w-full max-w-md space-y-3">
          <ErrorNotice error={me.error} onRetry={() => me.refetch()} />
          <Button onClick={signOut}>Sign out</Button>
        </div>
      </div>
    );
  }

  const data = me.data;
  const groups: NavGroup[] = ['Daily', 'Business', 'Admin']
    .map((label) => ({
      label,
      items: MODULES.filter((module) => module.group === label).flatMap((module) => {
        const pages = module.pages.filter((page) => canOpen(data, page));
        if (pages.length === 0) return [];
        return [{ to: pages[0].to, label: module.label, icon: module.icon, end: pages[0].to === '/', subpages: pages.map((page) => ({ to: page.to, label: page.label })) }];
      }),
    }))
    .filter((group) => group.items.length > 0);

  const dayBanner = !data.day.open && (data.permissions.includes('salesCreate') || data.permissions.includes('dayOpen')) ? (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-100 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 sm:px-8">
      <span><span className="font-semibold">The day is not open.</span> Start it before selling or recording money.</span>
      <Link to="/day" className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700">Start the day</Link>
    </div>
  ) : null;
  const banner = data.announcements.length > 0 || dayBanner ? (
    <div className="space-y-px">
      {dayBanner}
      <AnnouncementBanner announcements={data.announcements} />
    </div>
  ) : undefined;

  return (
    <Routes>
      <Route element={
        <ShellWithContext data={data} groups={groups} banner={banner} />
      }>
        <Route index element={<Home />} />
        <Route element={<Guard permission="salesCreate" />}><Route path="new-sale" element={<NewSale />} /></Route>
        <Route element={<Guard permission="sales" />}><Route path="day" element={<DayPage />} /></Route>
        <Route element={<Guard permission="reports" />}><Route path="reports" element={<Reports />} /></Route>
        <Route element={<ModuleTabs moduleKey="sales" />}>
          <Route element={<Guard permission="sales" />}>
            <Route path="sales" element={<Sales />} />
            <Route path="unpaid" element={<Sales unpaidOnly />} />
          </Route>
          <Route element={<Guard permission="waiterTabs" />}><Route path="waiter-tabs" element={<WaiterTabs />} /></Route>
        </Route>
        <Route element={<ModuleTabs moduleKey="money" />}>
          <Route element={<Guard permission="expenses" />}><Route path="expenses" element={<Expenses />} /></Route>
          <Route element={<Guard permission="payments" />}><Route path="payments" element={<Payments />} /></Route>
        </Route>
        <Route element={<ModuleTabs moduleKey="stock" />}>
          <Route element={<Guard permission="products" />}><Route path="products" element={<Products />} /></Route>
          <Route element={<Guard permission="purchases" />}><Route path="stock-in" element={<Purchases />} /></Route>
          <Route element={<Guard permission="movements" />}><Route path="movements" element={<Movements />} /></Route>
          <Route element={<Guard permission="stockReport" flag="stock_reports" />}><Route path="stock-report" element={<StockReport />} /></Route>
        </Route>
        <Route element={<ModuleTabs moduleKey="contacts" />}>
          <Route element={<Guard permission="customers" />}><Route path="customers" element={<Customers />} /></Route>
          <Route element={<Guard permission="suppliers" />}><Route path="suppliers" element={<Suppliers />} /></Route>
        </Route>
        <Route element={<ModuleTabs moduleKey="settings" />}>
          <Route element={<Guard permission="products" />}><Route path="settings" element={<BusinessSettings />} /></Route>
          <Route element={<Guard permission="staff" />}><Route path="staff" element={<Staff />} /></Route>
          <Route element={<Guard permission="audit" />}><Route path="activity" element={<Activity />} /></Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function ModuleTabs({ moduleKey }: { moduleKey: string }) {
  const me = useDashboard();
  const module = MODULE_BY_KEY[moduleKey];
  const pages = module.pages.filter((page) => canOpen(me, page));
  return (
    <>
      {pages.length > 1 ? (
        <nav aria-label={module.label} className="-mx-1 mb-5 overflow-x-auto px-1">
          <div className="inline-flex gap-1 rounded-xl border border-line bg-white p-1 shadow-[0_1px_2px_rgba(16,25,43,0.04)]">
            {pages.map((page) => (
              <NavLink
                key={page.to}
                to={page.to}
                className={({ isActive }) => `whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${isActive ? 'bg-brand text-white shadow-sm' : 'text-ink/70 hover:bg-slate-100 hover:text-ink'}`}
              >
                {page.label}
              </NavLink>
            ))}
          </div>
        </nav>
      ) : null}
      <Outlet />
    </>
  );
}

function ShellWithContext({ data, groups, banner }: { data: Me; groups: NavGroup[]; banner: ReactNode }) {
  return (
    <ContextProvider data={data}>
      <Shell
        brand={data.business.name}
        brandSub="MIA business dashboard"
        groups={groups}
        userName={data.user.name}
        userEmail={data.user.email}
        headerActions={<BusinessHeaderActions me={data} />}
        userSub={ROLE_LABELS[data.user.role] ?? data.user.role}
        onSignOut={signOut}
        sidebarClass="bg-[#0e3b36] text-emerald-50"
        activeClass="bg-emerald-600 text-white shadow-sm shadow-emerald-950/30"
        inactiveClass="text-emerald-100/80 hover:bg-white/5 hover:text-white"
        banner={banner}
      />
    </ContextProvider>
  );
}

function ContextProvider({ data, children }: { data: Me; children: ReactNode }) {
  return <MeContext.Provider value={data}>{children}</MeContext.Provider>;
}
