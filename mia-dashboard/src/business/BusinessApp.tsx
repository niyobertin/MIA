import { createContext, useContext, type ReactNode } from 'react';
import { Link, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { BarChart3, Building2, CalendarClock, ClipboardList, CreditCard, FileText, HandPlatter, LayoutDashboard, PackageSearch, PlusCircle, ReceiptText, Settings, ShieldCheck, ShoppingCart, Truck, Users, Warehouse } from 'lucide-react';
import { signOut, type Session } from '../lib/auth';
import { Shell, type NavGroup } from '../ui/Shell';
import { Button, ErrorNotice, Skeleton } from '../ui/kit';
import { useMe, type Me } from './useMe';
import { Overview } from './Overview';
import { Customers, Expenses, Movements, Payments, Products, Purchases, Sales, StockReport } from './tables';
import { Activity, BusinessSettings, Reports, Staff } from './manage';
import { NewSale } from './pos';
import { DayPage } from './day';
import { Suppliers } from './suppliers';
import { WaiterTabs } from './waiter';

const NAV: (NavGroup['items'][number] & { group: string; permission: string; flag?: string })[] = [
  { group: 'Overview', to: '/', label: 'Dashboard', icon: LayoutDashboard, permission: 'overview', end: true },
  { group: 'Overview', to: '/reports', label: 'Business reports', icon: FileText, permission: 'reports' },
  { group: 'Business', to: '/new-sale', label: 'New sale', icon: PlusCircle, permission: 'salesCreate' },
  { group: 'Business', to: '/day', label: 'Day', icon: CalendarClock, permission: 'sales' },
  { group: 'Business', to: '/sales', label: 'Sales', icon: ShoppingCart, permission: 'sales' },
  { group: 'Business', to: '/unpaid', label: 'Unpaid sales', icon: ClipboardList, permission: 'sales' },
  { group: 'Business', to: '/waiter-tabs', label: 'Waiter tabs', icon: HandPlatter, permission: 'waiterTabs' },
  { group: 'Business', to: '/payments', label: 'Payments', icon: CreditCard, permission: 'payments' },
  { group: 'Business', to: '/customers', label: 'Customers', icon: Users, permission: 'customers' },
  { group: 'Business', to: '/expenses', label: 'Expenses', icon: ReceiptText, permission: 'expenses' },
  { group: 'Inventory', to: '/products', label: 'Products', icon: PackageSearch, permission: 'products' },
  { group: 'Inventory', to: '/stock-in', label: 'Stock-in', icon: Truck, permission: 'purchases' },
  { group: 'Inventory', to: '/suppliers', label: 'Suppliers', icon: Building2, permission: 'suppliers' },
  { group: 'Inventory', to: '/movements', label: 'Stock movements', icon: Warehouse, permission: 'movements' },
  { group: 'Inventory', to: '/stock-report', label: 'Stock report', icon: BarChart3, permission: 'stockReport', flag: 'stock_reports' },
  { group: 'Management', to: '/staff', label: 'Staff & roles', icon: Users, permission: 'staff' },
  { group: 'Management', to: '/activity', label: 'Activity log', icon: ShieldCheck, permission: 'audit' },
  { group: 'Management', to: '/settings', label: 'Settings', icon: Settings, permission: 'products' },
];

const MeContext = createContext<Me | null>(null);

const ROLE_LABELS: Record<string, string> = { OWNER: 'Owner', MANAGER: 'Manager', CASHIER: 'Cashier', STAFF: 'Staff' };
const SEVERITY = { info: 'bg-sky-50 text-sky-900 border-sky-100', warning: 'bg-amber-50 text-amber-900 border-amber-100', critical: 'bg-rose-50 text-rose-900 border-rose-100' };

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

  if (me.isLoading) return <div className="p-8"><Skeleton className="h-96" /></div>;
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
  const items = NAV.filter((item) => item.to !== '/' ? data.permissions.includes(item.permission) && (!item.flag || data.flags[item.flag]) : data.permissions.includes('overview'));
  const groups: NavGroup[] = ['Overview', 'Business', 'Inventory', 'Management']
    .map((label) => ({ label, items: items.filter((item) => item.group === label) }))
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
      {data.announcements.map((a) => (
        <div key={a.id} role="status" className={`border-b px-4 py-2.5 text-sm sm:px-8 ${SEVERITY[a.severity]}`}>
          <span className="font-semibold">{a.title}: </span>{a.body}
        </div>
      ))}
    </div>
  ) : undefined;

  return (
    <Routes>
      <Route element={
        <ShellWithContext data={data} groups={groups} banner={banner} />
      }>
        <Route index element={<Home />} />
        <Route element={<Guard permission="reports" />}><Route path="reports" element={<Reports />} /></Route>
        <Route element={<Guard permission="sales" />}>
          <Route path="sales" element={<Sales />} />
          <Route path="unpaid" element={<Sales unpaidOnly />} />
        </Route>
        <Route element={<Guard permission="salesCreate" />}><Route path="new-sale" element={<NewSale />} /></Route>
        <Route element={<Guard permission="sales" />}><Route path="day" element={<DayPage />} /></Route>
        <Route element={<Guard permission="waiterTabs" />}><Route path="waiter-tabs" element={<WaiterTabs />} /></Route>
        <Route element={<Guard permission="suppliers" />}><Route path="suppliers" element={<Suppliers />} /></Route>
        <Route element={<Guard permission="payments" />}><Route path="payments" element={<Payments />} /></Route>
        <Route element={<Guard permission="customers" />}><Route path="customers" element={<Customers />} /></Route>
        <Route element={<Guard permission="expenses" />}><Route path="expenses" element={<Expenses />} /></Route>
        <Route element={<Guard permission="products" />}>
          <Route path="products" element={<Products />} />
          <Route path="settings" element={<BusinessSettings />} />
        </Route>
        <Route element={<Guard permission="purchases" />}><Route path="stock-in" element={<Purchases />} /></Route>
        <Route element={<Guard permission="movements" />}><Route path="movements" element={<Movements />} /></Route>
        <Route element={<Guard permission="stockReport" flag="stock_reports" />}><Route path="stock-report" element={<StockReport />} /></Route>
        <Route element={<Guard permission="staff" />}><Route path="staff" element={<Staff />} /></Route>
        <Route element={<Guard permission="audit" />}><Route path="activity" element={<Activity />} /></Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
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
        userSub={ROLE_LABELS[data.user.role] ?? data.user.role}
        onSignOut={signOut}
        sidebarClass="bg-[#0e3b36] text-emerald-50"
        activeClass="bg-emerald-700/50 text-white"
        inactiveClass="text-emerald-100/80 hover:bg-white/5 hover:text-white"
        banner={banner}
      />
    </ContextProvider>
  );
}

function ContextProvider({ data, children }: { data: Me; children: ReactNode }) {
  return <MeContext.Provider value={data}>{children}</MeContext.Provider>;
}
