import React, { useState, useMemo, useEffect } from 'react';
import axios from 'axios';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, FileText, ShoppingCart, CreditCard, Package, Warehouse, Users, ShieldCheck,
  Bell, Menu, ChevronDown, TrendingUp, TrendingDown, MoreHorizontal, ArrowRight, Filter,
  CheckCircle2, Clock, AlertCircle, RefreshCcw, Search, BarChart3, CircleDollarSign,
  PackageOpen, Receipt, ReceiptText, Truck, Settings, LogOut
} from 'lucide-react';

const SkeletonBlock = ({ className = '' }: { className?: string }) => (
  <div className={`bg-gradient-to-r from-slate-100 to-slate-50 rounded-xl animate-pulse ${className}`} />
);


const NAV = [
  { label: 'Overview', icon: LayoutDashboard, items: ['Dashboard', 'Business Reports'] },
  { label: 'Business', icon: ShoppingCart, items: ['POS / Sales', 'Orders', 'Payments', 'Customers'] },
  { label: 'Inventory', icon: Warehouse, items: ['Products', 'Stock-In', 'Stock Movements', 'Stock Reports'] },
  { label: 'Management', icon: Users, items: ['Staff & Roles', 'Activity & Audit Logs', 'Settings'] },
];

const KPI = [
  { label: 'Total Businesses', value: '3', delta: '+1', up: true, icon: CircleDollarSign, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-100', liveKey: 'businesses' },
  { label: 'Payments Received', value: '2,120,000', delta: '+8.2%', up: true, icon: CreditCard, color: 'text-sky-700', bg: 'bg-sky-50', border: 'border-sky-100' },
  { label: 'Outstanding Balance', value: '580,000', delta: '-4.1%', up: false, icon: AlertCircle, color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-100' },
  { label: 'Low-Stock Items', value: '14', delta: '+3', up: true, icon: PackageOpen, color: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-100' },
  { label: 'Expenses', value: '420,000', delta: '+2.1%', up: true, icon: ReceiptText, color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-100' },
];

const ORDERS = [
  { id: 'ORD-1042', customer: 'Jean Paul', total: '45,000 RWF', status: 'Unpaid', time: '10:23', statusColor: 'bg-amber-100 text-amber-700' },
  { id: 'ORD-1043', customer: 'Marie Uwimana', total: '120,000 RWF', status: 'Partial', time: '10:15', statusColor: 'bg-sky-100 text-sky-700' },
  { id: 'ORD-1041', customer: 'David Ndayisaba', total: '78,500 RWF', status: 'Paid', time: '09:40', statusColor: 'bg-emerald-100 text-emerald-700' },
];

const TX = [
  { type: 'Sale', desc: 'ORD-1042 — Jean Paul', amount: '+45,000', time: '10:23', color: 'text-emerald-700' },
  { type: 'Payment', desc: 'Customer cash — ORD-1043', amount: '+60,000', time: '10:10', color: 'text-sky-700' },
  { type: 'Stock-In', desc: 'Purchase — Rice 25kg', amount: '+850,000', time: '09:55', color: 'text-violet-700' },
  { type: 'Expense', desc: 'Transport — Driver', amount: '-25,000', time: '09:30', color: 'text-rose-700' },
];

const LOW = [
  { name: 'Rice — 25kg', qty: 3, min: 10, unit: 'bags', color: 'bg-rose-100 text-rose-700' },
  { name: 'Maize Flour — 2kg', qty: 7, min: 15, unit: 'packs', color: 'bg-amber-100 text-amber-700' },
  { name: 'Sugar — 1kg', qty: 2, min: 20, unit: 'packs', color: 'bg-rose-100 text-rose-700' },
];

const MOVEMENTS = [
  { at: '10:15', product: 'Rice — 25kg', type: 'Stock-In', qty: '+120', ref: 'PUR-202', user: 'Alice', sign: 'positive' },
  { at: '09:55', product: 'Maize Flour — 2kg', type: 'Sale', qty: '-45', ref: 'ORD-1041', user: 'Joseph', sign: 'negative' },
  { at: '09:30', product: 'Sugar — 1kg', type: 'Adjustment', qty: '-10', ref: 'ADJ-12', user: 'Marie', sign: 'negative' },
];


export default function App() {
  const [queryClient] = useState(() => new QueryClient());
  const [activeNav, setActiveNav] = useState('Dashboard');
  const [openSection, setOpenSection] = useState<string | null>('Overview');
  const [dateRange, setDateRange] = useState('Last 7 days');
  const [orders, setOrders] = useState(ORDERS);
  const [tx, setTx] = useState(TX);
  const [low, setLow] = useState(LOW);
  const [movements, setMovements] = useState(MOVEMENTS);
  const [businesses, setBusinesses] = useState(3);
  const [users, setUsers] = useState(12);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const syncQuery = useQuery({
    queryKey: ['sync'],
    queryFn: async () => {
      const res = await axios.get(import.meta.env.VITE_API_URL + '/sync/pull', { headers: { Authorization: 'Bearer dev-token' } });
      return res.data;
    },
    staleTime: 60000,
  });

  useEffect(() => {
    if (syncQuery.data) {
      setLive(true);
      if (Array.isArray(syncQuery.data.tables?.businesses)) setBusinesses(syncQuery.data.tables.businesses.length);
      if (Array.isArray(syncQuery.data.tables?.users)) setUsers(syncQuery.data.tables.users.length);
      if (Array.isArray(syncQuery.data.tables?.sales)) setOrders(syncQuery.data.tables.sales.slice(0, 3).map((s: any) => ({ id: s.reference_number ?? s.id, customer: s.customer_id ?? '—', total: s.total_amount ? `${s.total_amount} RWF` : '0 RWF', status: s.payment_status === 'paid' ? 'Paid' : s.payment_status === 'partial' ? 'Partial' : 'Unpaid', time: s.sale_date?.slice(11, 16) || '—', statusColor: s.payment_status === 'paid' ? 'bg-emerald-100 text-emerald-700' : s.payment_status === 'partial' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700' })));
    }
    setLoading(syncQuery.isLoading);
  }, [syncQuery.data, syncQuery.isLoading]);

  const periodLabel = () => {
    switch (dateRange) {
      case 'Today': return 'Today';
      case 'Yesterday': return 'Yesterday';
      case 'Last 7 days': return 'Last 7 days';
      case 'Last 30 days': return 'Last 30 days';
      default: return 'Custom';
    }
  };

  return (
    <QueryClientProvider client={queryClient}>
    <div className="min-h-screen bg-[#f8fafb] text-slate-800 font-sans antialiased selection:bg-emerald-100">
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-[260px] shrink-0 bg-[#0e3b36] text-emerald-50 fixed h-screen overflow-y-auto z-30 shadow-2xl">
          <div className="px-6 pt-8 pb-4">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-900/20">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="text-[15px] font-extrabold tracking-tight leading-none">MIA</div>
                <div className="text-[11px] text-emerald-300/70 font-medium">Business Management</div>
              </div>
            </div>
          </div>

          <nav className="px-3 pb-6 space-y-1">
            {NAV.map((group) => (
              <div key={group.label}>
                <button
                  onClick={() => setOpenSection(openSection === group.label ? null : group.label)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${openSection === group.label ? 'bg-emerald-700/40 text-white' : 'text-emerald-100/80 hover:text-white hover:bg-white/5'}`}
                >
                  <group.icon size={16} />
                  <span className="flex-1 text-left">{group.label}</span>
                  <ChevronDown size={14} className={`transition-transform ${openSection === group.label ? 'rotate-180' : ''}`} />
                </button>
                <div className={`overflow-hidden transition-all duration-200 ${openSection === group.label ? 'max-h-[300px] opacity-100' : 'max-h-0 opacity-0'}`}>
                  <div className="pl-9 pr-2 py-1 space-y-0.5">
                    {group.items.map((item) => (
                      <a
                        key={item}
                        href="#"
                        onClick={() => setActiveNav(item)}
                        className={`block px-3 py-1.5 rounded-md text-sm transition-colors ${activeNav === item ? 'bg-emerald-700/60 text-white font-medium shadow' : 'text-emerald-100/70 hover:text-white hover:bg-white/5'}`}
                      >
                        {item}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </nav>

          <div className="absolute bottom-0 left-0 right-0 p-5 border-t border-emerald-800/40 bg-[#0e3b36]/90 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <img src="https://i.pravatar.cc/150?img=11" alt="User" className="w-8 h-8 rounded-full ring-2 ring-emerald-500/30" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">Alice Uwimana</div>
                <div className="text-[11px] text-emerald-300/70 truncate">Super Admin · Manager</div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="ml-[260px] flex-1 min-w-0">
          {/* Header */}
          <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-slate-200/80 px-8 h-[72px] flex items-center justify-between shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight leading-none">Dashboard</h1>
              <p className="text-sm text-slate-500 mt-1">Overview for MIA Business · RWF currency</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <select value={dateRange} onChange={(e) => setDateRange((e.target as HTMLSelectElement).value)} className="text-sm font-medium bg-slate-100 rounded-full px-4 py-1.5 border-none text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-300 cursor-pointer">
                  <option>Today</option>
                  <option>Yesterday</option>
                  <option>Last 7 days</option>
                  <option>Last 30 days</option>
                  <option>Custom</option>
                </select>
              </div>
              <div className="w-px h-6 bg-slate-200 mx-1" />
              <button className="relative p-2 hover:bg-slate-100 rounded-full transition-colors" aria-label="Notifications">
                <Bell size={20} className="text-slate-600" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-white" />
              </button>
              <button className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full hover:bg-slate-100 border border-slate-200 transition-colors">
                <img src="https://i.pravatar.cc/150?img=11" alt="User" className="w-7 h-7 rounded-full" />
                <span className="text-sm font-medium text-slate-700 hidden sm:block">Alice</span>
                <ChevronDown size={14} className="text-slate-400" />
              </button>
            </div>
          </header>

          <div className="max-w-7xl mx-auto px-8 py-8 space-y-8">
            <div className="flex items-center justify-between gap-4 mb-2">
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Dashboard</h2>
                <p className="text-sm text-slate-500">Overview for MIA Business · RWF currency</p>
              </div>
              <select onChange={(e) => { if (e.target.value) void 0; }} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200">
                <option>Quick Actions</option>
                <option>New Sale</option>
                <option>Stock-In</option>
                <option>Orders</option>
                <option>Reports</option>
              </select>
            </div>

            {/* KPI */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
              {loading ? [0,1,2,3,4].map(i => <SkeletonBlock key={i} className="h-[140px] rounded-2xl" />) : KPI.map((k) => {
                const val = k.liveKey === 'businesses' ? String(businesses) : k.liveKey === 'users' ? String(users) : k.value;
                return (
                  <a key={k.label} href="#" className="group bg-white rounded-2xl border border-slate-200/60 p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-lg hover:-translate-y-0.5 transition-all relative">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${k.bg} ${k.color} shadow-sm`}>
                      <k.icon size={20} />
                    </div>
                    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${k.up ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {k.up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {k.delta}
                    </span>
                  </div>
                  <div className="text-3xl font-extrabold text-slate-900 tracking-tight">{val}</div>
                  <div className="text-sm font-medium text-slate-500 mt-1">{k.label}</div>
                  {live && k.liveKey ? <span className="absolute top-3 right-3 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md">LIVE</span> : null}
                </a>
              )})}
            </div>

            {/* Analytics */}
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/60 p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-slate-900">Sales Trend</h3>
                  <span className="text-xs font-medium text-slate-400">{periodLabel()} · RWF</span>
                </div>
                <div className="h-64 w-full relative">
                  <svg viewBox="0 0 700 180" preserveAspectRatio="none" className="w-full h-full">
                    <defs>
                      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#059669" stopOpacity="0.15" />
                        <stop offset="100%" stopColor="#059669" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d="M0,140 Q60,110 120,100 T240,90 T360,60 T480,45 T600,30 T700,25 L700,180 L0,180 Z" fill="url(#areaGrad)" />
                    <path d="M0,140 Q60,110 120,100 T240,90 T360,60 T480,45 T600,30 T700,25" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" />
                    {[
                      { x: 120, y: 100, label: 'Mon' }, { x: 240, y: 90, label: 'Tue' },
                      { x: 360, y: 60, label: 'Wed' }, { x: 480, y: 45, label: 'Thu' },
                      { x: 600, y: 30, label: 'Fri' },
                    ].map((d) => (
                      <g key={d.x}><circle cx={d.x} cy={d.y} r={3} fill="#059669" /><text x={d.x} y={168} textAnchor="middle" fontSize="9" fill="#64748b">{d.label}</text></g>
                    ))}
                  </svg>
                </div>
                <div className="flex gap-6 mt-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-600" /> Sales</span>
                  <span>Period: {periodLabel()}</span>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/60 p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <h3 className="text-lg font-bold text-slate-900 mb-2">Sales by Category</h3>
                <p className="text-xs text-slate-400 mb-4">Distribution by product category</p>
                <div className="flex items-center gap-6">
                  <svg viewBox="0 0 100 100" className="w-32 h-32 -rotate-90">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#e2e8f0" strokeWidth="12" />
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#059669" strokeWidth="12" strokeDasharray="150 251" strokeLinecap="round" />
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#0ea5e9" strokeWidth="12" strokeDasharray="70 251" strokeDashoffset="-150" strokeLinecap="round" />
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#f59e0b" strokeWidth="12" strokeDasharray="45 251" strokeDashoffset="-220" strokeLinecap="round" />
                  </svg>
                  <div className="space-y-2 flex-1">
                    {[
                      { label: 'Dry Goods', pct: '52%', color: 'bg-emerald-500' },
                      { label: 'Fresh', pct: '24%', color: 'bg-sky-500' },
                      { label: 'Other', pct: '15%', color: 'bg-amber-500' },
                      { label: 'Services', pct: '9%', color: 'bg-rose-400' },
                    ].map((c) => (
                      <div key={c.label} className="flex items-center gap-2 text-sm"><span className={`w-2.5 h-2.5 rounded-full ${c.color}`} /> <span className="font-medium text-slate-700">{c.label}</span> <span className="ml-auto text-slate-400">{c.pct}</span></div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Tables */}
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Pending Orders */}
              <section className="bg-white rounded-2xl border border-slate-200/60 shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2"><ShoppingCart size={18} className="text-amber-600" /> Pending Orders</h3>
                  <a href="#" className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-0.5">View All <ArrowRight size={12} /></a>
                </div>
                <div className="divide-y divide-slate-50">
                  {ORDERS.map((o) => (
                    <a key={o.id} href="#" className="flex items-center justify-between px-6 py-3 hover:bg-slate-50 transition-colors">
                      <div>
                        <div className="font-semibold text-sm text-slate-900">{o.id}</div>
                        <div className="text-xs text-slate-500">{o.customer}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-sm text-slate-900">{o.total}</div>
                        <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${o.statusColor}`}>{o.status}</span>
                        <div className="text-[11px] text-slate-400 mt-0.5">{o.time}</div>
                      </div>
                    </a>
                  ))}
                </div>
              </section>

              {/* Recent Transactions */}
              <section className="bg-white rounded-2xl border border-slate-200/60 shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2"><Receipt size={18} className="text-violet-600" /> Recent Transactions</h3>
                  <a href="#" className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-0.5">View All <ArrowRight size={12} /></a>
                </div>
                <div className="divide-y divide-slate-50">
                  {TX.map((t) => (
                    <a key={t.desc} href="#" className="flex items-center justify-between px-6 py-3 hover:bg-slate-50 transition-colors">
                      <div>
                        <div className="font-medium text-sm text-slate-900">{t.desc}</div>
                        <div className="text-[11px] text-slate-400">{t.type}</div>
                      </div>
                      <div className="text-right">
                        <div className={`font-bold text-sm ${t.color}`}>{t.amount}</div>
                        <div className="text-[11px] text-slate-400">{t.time}</div>
                      </div>
                    </a>
                  ))}
                </div>
              </section>

              {/* Low Stock */}
              <section className="bg-white rounded-2xl border border-slate-200/60 shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2"><AlertCircle size={18} className="text-rose-600" /> Low-Stock Items</h3>
                  <a href="#" className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-0.5">View All <ArrowRight size={12} /></a>
                </div>
                <div className="divide-y divide-slate-50">
                  {LOW.map((l) => (
                    <a key={l.name} href="#" className="flex items-center justify-between px-6 py-3 hover:bg-slate-50 transition-colors">
                      <div>
                        <div className="font-medium text-sm text-slate-900">{l.name}</div>
                        <div className="text-xs text-slate-500">Unit: {l.unit}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-sm text-rose-600">{l.qty}</div>
                        <div className="text-[11px] text-slate-400">Min: {l.min}</div>
                      </div>
                    </a>
                  ))}
                </div>
              </section>
            </div>

            {/* Stock Movements + Activity */}
            <div className="grid lg:grid-cols-2 gap-6">
              <section className="bg-white rounded-2xl border border-slate-200/60 p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2"><Truck size={18} className="text-amber-600" /> Recent Stock Movements</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-400 font-medium text-left border-b border-slate-100">
                        <th className="py-2 pr-4">Date</th>
                        <th className="py-2 pr-4">Product</th>
                        <th className="py-2 pr-4">Type</th>
                        <th className="py-2 pr-4">Qty</th>
                        <th className="py-2">User</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MOVEMENTS.map((m) => (
                        <tr key={m.at + m.product} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 text-xs text-slate-500 whitespace-nowrap">{m.at}</td>
                          <td className="py-2.5 font-medium text-slate-800">{m.product}</td>
                          <td className="py-2.5"><span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${m.sign === 'positive' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{m.type}</span></td>
                          <td className="py-2.5 font-mono font-medium text-slate-900">{m.qty}</td>
                          <td className="py-2.5 text-xs text-slate-500">{m.user}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="bg-white rounded-2xl border border-slate-200/60 p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2"><ShieldCheck size={18} className="text-teal-600" /> Business Activity</h3>
                <div className="space-y-3">
                  {[
                    { icon: ShoppingCart, text: 'New sale completed — ORD-1042 (Jean Paul)', time: '10:23', who: 'Joseph' },
                    { icon: Truck, text: 'Stock received — Rice 25kg (PUR-202)', time: '10:15', who: 'Alice' },
                    { icon: AlertCircle, text: 'Low-stock alert — Sugar 1kg (2 left)', time: '09:55', who: 'System' },
                    { icon: RefreshCcw, text: 'Day close completed — 2026-10-29', time: '08:00', who: 'Alice' },
                  ].map((a) => (
                    <a key={a.text} href="#" className="flex gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                      <div className="w-9 h-9 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center shrink-0"><a.icon size={16} /></div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 leading-snug">{a.text}</div>
                        <div className="text-xs text-slate-400">{a.time} · by {a.who}</div>
                      </div>
                    </a>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </main>
      </div>
    </div>
    </QueryClientProvider>
  );
}
