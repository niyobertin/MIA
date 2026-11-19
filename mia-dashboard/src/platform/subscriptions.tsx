import { useState, type FormEvent } from 'react';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarClock, CalendarPlus, CircleCheck, CircleX, CreditCard, Eye, History, Hourglass, Lightbulb, Pencil, PieChart, Plus, Receipt, RefreshCw, Repeat, ShieldOff, Tags, TrendingUp, Wallet } from 'lucide-react';
import { formatDate, formatMoney, formatNumber, humanize } from '../lib/format';
import { platformApi } from '../lib/platformAuth';
import { CurveChart, DonutChart } from '../ui/charts';
import { Select } from '../ui/Select';
import {
  ActionMenu, AdminButton, AdminPageHeader, AdminTable, Boundary, ConfirmDialog, DetailList, Drawer, EmptyState, ErrorState, FilterSelect, IconAction, KpiCard, Modal,
  Panel, PlanBadge, SearchInput, Segmented, StatusBadge, TableToolbar, Tabs, fieldClass, labelClass, timeAgo, useInvalidate, type AdminColumn, type MenuAction,
} from './ui/admin';
import { DrawerSkeleton, KpiGridSkeleton, LoadingRegion, PageHeaderSkeleton, PanelSkeleton, SkeletonChart, SkeletonDonut, TableCardSkeleton } from './ui/skeleton';
import { useServerList } from './ui/useServerList';
import { BusinessPicker } from './shared';
import { planOptions, usePlans } from './businesses';
import { bucketLabel } from './overview';
import { useCan } from './context';

export const GRACE_DAYS = 3;

export type SubscriptionRow = {
  id: string; name: string; business_code: string; currency: string; plan: string; plan_name: string | null; monthly_price: number | null; subscription_status: string; effective_status: string;
  trial_ends_at: string | null; current_period_end: string | null; ends_at: string | null; billing_period: string | null; plan_amount: number | null; subscription_started_at: string | null; open_balance: number;
};
type Summary = { active: number; expiring_soon: number; grace: number; expired: number; trial: number; suspended: number; expiring_7d: number; open_invoices: number; open_amount: number; paid_30d: number; paid_prev_30d: number; paid_invoices: number; pending_payments: number };

const STATUS_FILTERS = [
  { value: 'all', label: 'All statuses' }, { value: 'active', label: 'Active' }, { value: 'expiring_soon', label: 'Expiring soon' }, { value: 'grace', label: 'Grace period' },
  { value: 'expired', label: 'Expired' }, { value: 'pending_payment', label: 'Pending payment' }, { value: 'trial', label: 'Trial' }, { value: 'suspended', label: 'Suspended' },
];

export function graceInfo(endsAt: string | null) {
  if (!endsAt) return null;
  const graceEnds = new Date(new Date(endsAt).getTime() + GRACE_DAYS * 86_400_000);
  return { graceEnds, daysLeft: Math.ceil((graceEnds.getTime() - Date.now()) / 86_400_000) };
}

export function GraceCell({ endsAt, status }: { endsAt: string | null; status: string }) {
  const info = graceInfo(endsAt);
  if (!info) return <span className="text-muted">—</span>;
  if (status === 'grace') return <span className="text-xs font-semibold text-orange-700">{info.daysLeft} day{info.daysLeft === 1 ? '' : 's'} left · until {formatDate(info.graceEnds)}</span>;
  if (status === 'expired') return <span className="text-xs text-rose-700">Ended {formatDate(info.graceEnds)}</span>;
  return <span className="text-xs text-muted">{GRACE_DAYS} days after expiry</span>;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date.getTime());
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  next.setUTCDate(Math.min(day, new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()));
  return next;
}

export type SubscriptionAction = 'renew' | 'change-plan' | 'extend' | 'suspend' | 'reactivate';
const ACTION_TITLES: Record<SubscriptionAction, string> = { renew: 'Renew subscription', 'change-plan': 'Change plan', extend: 'Extend subscription', suspend: 'Suspend subscription', reactivate: 'Reactivate subscription' };
const INVALIDATE = ['platform-billing', 'platform-subscription', 'platform-business', 'platform-businesses', 'platform-overview', 'platform-billing-trend', 'platform-alert-summary', 'platform-activity', 'platform-plans'];

export function SubscriptionManagementDialog({ businessId: initialBusiness, current, action: initialAction, onClose }: {
  businessId?: string; current?: Pick<SubscriptionRow, 'plan' | 'subscription_status' | 'current_period_end' | 'trial_ends_at' | 'name'> | null; action: SubscriptionAction; onClose: () => void;
}) {
  const plans = usePlans();
  const [businessId, setBusinessId] = useState(initialBusiness ?? '');
  const [action] = useState(initialAction);
  const [months, setMonths] = useState('1');
  const [plan, setPlan] = useState(current?.plan && current.plan !== 'free' ? current.plan : '');
  const [amount, setAmount] = useState('');
  const [days, setDays] = useState('7');
  const [reason, setReason] = useState('');
  const refresh = useInvalidate();
  const target = useQuery({
    queryKey: ['platform-subscription', businessId],
    queryFn: async () => (await platformApi.get<SubscriptionDetail>(`/businesses/${businessId}/subscription`)).data,
    enabled: Boolean(businessId) && !current,
  });
  const state = current ?? (target.data ? { plan: target.data.subscription.plan, subscription_status: target.data.subscription.stored_status, current_period_end: target.data.subscription.stored_status === 'trial' ? null : target.data.subscription.ends_at, trial_ends_at: target.data.subscription.stored_status === 'trial' ? target.data.subscription.ends_at : null, name: target.data.business.name } : null);
  const activePlans = (plans.data?.rows ?? []).filter((row) => row.active);
  const chosenPlan = action === 'change-plan' ? activePlans.find((row) => row.code === plan) : activePlans.find((row) => row.code === state?.plan);
  const listPrice = chosenPlan ? chosenPlan.monthly_price * Number(months) : 0;
  const mutation = useMutation({
    mutationFn: () => platformApi.post(`/businesses/${businessId}/subscription`, {
      action, reason,
      ...(action === 'renew' ? { months: Number(months), ...(amount ? { amount: Number(amount) } : {}) } : {}),
      ...(action === 'change-plan' ? { plan, ...(plan !== 'free' ? { months: Number(months) } : {}), ...(amount ? { amount: Number(amount) } : {}) } : {}),
      ...(action === 'extend' ? { days: Number(days) } : {}),
    }),
    onSuccess: async () => { await refresh(INVALIDATE); onClose(); },
  });
  const now = new Date();
  const currentEnd = state?.current_period_end ? new Date(state.current_period_end) : null;
  const continues = action === 'renew' && currentEnd && currentEnd.getTime() + GRACE_DAYS * 86_400_000 >= now.getTime() && state?.subscription_status !== 'trial';
  const previewEnd = action === 'renew' ? addMonths(continues && currentEnd ? currentEnd : now, Number(months))
    : action === 'change-plan' && plan && plan !== 'free' ? addMonths(now, Number(months))
      : action === 'extend' ? new Date(Math.max(now.getTime(), new Date((state?.subscription_status === 'trial' ? state?.trial_ends_at : state?.current_period_end) ?? now).getTime()) + Number(days) * 86_400_000) : null;
  const submit = (event: FormEvent) => { event.preventDefault(); if (!mutation.isPending) mutation.mutate(); };
  const danger = action === 'suspend';
  return (
    <Modal title={`${ACTION_TITLES[action]}${state?.name ? `: ${state.name}` : ''}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {!initialBusiness ? <div><label className={labelClass} htmlFor="sub-org">Organization</label><BusinessPicker id="sub-org" value={businessId} onChange={setBusinessId} /></div> : null}
        {businessId && !current && target.isPending ? <div className="space-y-2"><span className="skeleton block h-4 w-40 rounded" /><span className="skeleton block h-10 rounded-xl" /></div> : null}
        {state ? <div className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm text-ink/80">Current: <strong>{humanize(state.plan)}</strong> · {humanize(state.subscription_status)}{(state.current_period_end ?? state.trial_ends_at) ? ` · ends ${formatDate(state.current_period_end ?? state.trial_ends_at)}` : ''}</div> : null}
        {action === 'change-plan' ? (
          <div>
            <label className={labelClass} htmlFor="sub-plan">New plan</label>
            <Select id="sub-plan" value={plan} onChange={setPlan} placeholder={plans.isPending ? 'Loading plans…' : 'Choose a plan'} options={[{ value: 'free', label: 'Free', hint: 'No charge' }, ...activePlans.map((row) => ({ value: row.code, label: row.name, hint: `${formatMoney(row.monthly_price, 'RWF')} / month` }))]} />
            {!plans.isPending && activePlans.length === 0 ? <p className="mt-1.5 text-xs text-amber-700">No paid plans exist yet. Add one in the plan catalog first.</p> : null}
          </div>
        ) : null}
        {action === 'renew' || (action === 'change-plan' && plan && plan !== 'free') ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={labelClass} htmlFor="sub-months">Duration</label><Select id="sub-months" value={months} onChange={setMonths} searchable={false} options={[1, 3, 6, 12].map((value) => ({ value: String(value), label: `${value} month${value === 1 ? '' : 's'}` }))} /></div>
            <div><label className={labelClass} htmlFor="sub-amount">Amount (RWF)</label><input id="sub-amount" inputMode="numeric" pattern="\d*" placeholder={listPrice ? formatNumber(listPrice) : '0'} value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} className={fieldClass} /><p className="mt-1 text-xs text-muted">{listPrice ? `List price ${formatMoney(listPrice, 'RWF')}. ` : ''}An unpaid invoice is created.</p></div>
          </div>
        ) : null}
        {action === 'extend' ? <div><label className={labelClass} htmlFor="sub-days">Extra days</label><input id="sub-days" type="number" min={1} max={365} required value={days} onChange={(e) => setDays(e.target.value)} className={fieldClass} /><p className="mt-1 text-xs text-muted">No invoice is created.</p></div> : null}
        {previewEnd ? <div className="rounded-xl border border-brand/20 bg-brand-soft px-3.5 py-2.5 text-sm text-brand-dark">New expiry <strong>{formatDate(previewEnd)}</strong> · grace period until {formatDate(new Date(previewEnd.getTime() + GRACE_DAYS * 86_400_000))}</div> : null}
        {danger ? <p className="text-sm text-muted">The subscription stops counting as active. Sign-in is not blocked; suspend the organization for that. The owner is emailed.</p> : null}
        <div><label className={labelClass} htmlFor="sub-reason">Reason <span className="font-normal text-muted">(saved in the audit log)</span></label><textarea id="sub-reason" required minLength={5} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={fieldClass} /></div>
        {mutation.isError ? <ErrorState error={mutation.error} compact /> : null}
        <div className="flex justify-end gap-2">
          <AdminButton type="button" onClick={onClose}>Cancel</AdminButton>
          <AdminButton type="submit" tone={danger ? 'danger' : 'primary'} disabled={mutation.isPending || !businessId || (action === 'change-plan' && !plan)}>{mutation.isPending ? 'Saving…' : ACTION_TITLES[action]}</AdminButton>
        </div>
      </form>
    </Modal>
  );
}

export type SubscriptionDetail = {
  business: { id: string; name: string; currency: string };
  subscription: { plan: string; plan_name: string | null; plan_monthly_price: number | null; stored_status: string; status: string; billing_period: string | null; amount: number | null; started_at: string | null; ends_at: string | null; grace_ends_at: string | null; days_remaining: number | null; grace_days_remaining: number | null; open_balance: number; grace_period_days: number };
  invoices: { id: string; amount: number; currency: string; period_start: string; period_end: string; status: string; payment_method: string | null; payment_reference: string | null; paid_at: string | null; created_at: string }[];
  history: { id: string; action: string; admin_email: string | null; reason: string | null; metadata: { before?: Record<string, unknown>; after?: Record<string, unknown> } | null; created_at: string }[];
};

export function useSubscriptionDetail(businessId: string) {
  return useQuery({ queryKey: ['platform-subscription', businessId], queryFn: async () => (await platformApi.get<SubscriptionDetail>(`/businesses/${businessId}/subscription`)).data });
}

export function PaymentHistory({ data }: { data: SubscriptionDetail }) {
  const canWrite = useCan('billing:write');
  const [pending, setPending] = useState<{ id: string; status: 'paid' | 'void' } | null>(null);
  if (data.invoices.length === 0) return <EmptyState icon={Receipt} title="No invoices yet">Invoices are created when a subscription is renewed or a paid plan starts.</EmptyState>;
  return (
    <>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {data.invoices.map((invoice) => (
          <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-3 text-sm">
            <span className="min-w-0"><span className="block font-semibold text-ink">{formatMoney(invoice.amount, invoice.currency)}</span><span className="block text-xs text-muted">{formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}{invoice.paid_at ? ` · paid ${formatDate(invoice.paid_at)}${invoice.payment_method ? ` by ${invoice.payment_method}` : ''}` : ''}</span></span>
            <span className="flex items-center gap-2"><StatusBadge status={invoice.status} />{canWrite && invoice.status === 'open' ? <><AdminButton className="!min-h-8 !px-2.5 !text-xs" onClick={() => setPending({ id: invoice.id, status: 'paid' })}>Mark paid</AdminButton><AdminButton className="!min-h-8 !px-2.5 !text-xs" onClick={() => setPending({ id: invoice.id, status: 'void' })}>Void</AdminButton></> : null}</span>
          </li>
        ))}
      </ul>
      {pending ? <InvoiceDialog invoiceId={pending.id} status={pending.status} onClose={() => setPending(null)} /> : null}
    </>
  );
}

function InvoiceDialog({ invoiceId, status, onClose }: { invoiceId: string; status: 'paid' | 'void'; onClose: () => void }) {
  const [method, setMethod] = useState('mobile_money');
  const [reference, setReference] = useState('');
  return (
    <ConfirmDialog title={status === 'paid' ? 'Record payment' : 'Void invoice'} confirmLabel={status === 'paid' ? 'Record payment' : 'Void invoice'} tone={status === 'void' ? 'danger' : 'primary'} needsReason={false} onClose={onClose} invalidate={INVALIDATE}
      description={status === 'paid' ? 'Only record money you have actually received. The owner gets a receipt email.' : 'The invoice stays in the history as void.'}
      run={() => platformApi.post(`/billing/invoices/${invoiceId}/status`, { status, ...(status === 'paid' ? { payment_method: method, payment_reference: reference || undefined } : {}) })}>
      {status === 'paid' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={labelClass} htmlFor="pay-method">Method</label><Select id="pay-method" value={method} onChange={setMethod} searchable={false} options={[{ value: 'mobile_money', label: 'Mobile money' }, { value: 'bank_transfer', label: 'Bank transfer' }, { value: 'cash', label: 'Cash' }, { value: 'card', label: 'Card' }]} /></div>
          <div><label className={labelClass} htmlFor="pay-ref">Reference</label><input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} className={fieldClass} /></div>
        </div>
      ) : null}
    </ConfirmDialog>
  );
}

export function SubscriptionHistory({ data }: { data: SubscriptionDetail }) {
  if (data.history.length === 0) return <EmptyState icon={History} title="No changes recorded yet" />;
  return (
    <ol className="relative space-y-4 border-l border-line pl-4">
      {data.history.map((row) => (
        <li key={row.id}>
          <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand" />
          <div className="text-sm font-semibold text-ink">{humanize(row.action.replace('subscription.', '').replace('billing.', ''))}</div>
          <div className="text-xs text-muted">{row.admin_email ?? 'System'} · {timeAgo(row.created_at)}{row.reason ? ` · ${row.reason}` : ''}</div>
          {row.metadata?.before && row.metadata?.after ? (
            <div className="mt-1 text-xs text-ink/70">
              {Object.keys(row.metadata.after).filter((key) => JSON.stringify(row.metadata!.before![key]) !== JSON.stringify(row.metadata!.after![key])).map((key) => (
                <div key={key}>{humanize(key)}: <span className="text-muted line-through">{String(row.metadata!.before![key] ?? '—').slice(0, 24)}</span> → <span className="font-medium">{String(row.metadata!.after![key] ?? '—').slice(0, 24)}</span></div>
              ))}
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export function subscriptionActionsFor(row: Pick<SubscriptionRow, 'plan' | 'subscription_status'>, canWrite: boolean, open: (action: SubscriptionAction) => void, extra: MenuAction[] = []): MenuAction[] {
  return [
    ...extra,
    { label: 'Renew subscription', icon: RefreshCw, onSelect: () => open('renew'), hidden: !canWrite || row.plan === 'free' },
    { label: 'Change plan', icon: Repeat, onSelect: () => open('change-plan'), hidden: !canWrite },
    { label: 'Extend subscription', icon: CalendarPlus, onSelect: () => open('extend'), hidden: !canWrite },
    { label: 'Reactivate subscription', icon: CircleCheck, onSelect: () => open('reactivate'), hidden: !canWrite || !['suspended', 'cancelled'].includes(row.subscription_status) },
    { label: 'Suspend subscription', icon: ShieldOff, tone: 'danger', onSelect: () => open('suspend'), hidden: !canWrite || ['suspended', 'cancelled'].includes(row.subscription_status) },
  ];
}

function SubscriptionDetailsDrawer({ row, onClose, initialTab = 'overview' }: { row: SubscriptionRow; onClose: () => void; initialTab?: 'overview' | 'payments' | 'history' }) {
  const [tab, setTab] = useState(initialTab);
  const query = useSubscriptionDetail(row.id);
  return (
    <Drawer title={row.name} subtitle={<span className="flex items-center gap-2"><PlanBadge plan={row.plan} name={row.plan_name} /><StatusBadge status={row.effective_status} /></span>} onClose={onClose}
      footer={<Link to={`/platform/businesses/${row.id}/subscriptions`} className="text-sm font-semibold text-brand hover:underline">Open in organization details</Link>}>
      <Tabs label="Subscription sections" value={tab} onChange={setTab} tabs={[{ value: 'overview', label: 'Overview' }, { value: 'payments', label: 'Payments' }, { value: 'history', label: 'History' }]} />
      <div className="pt-5">
        {query.isPending ? <DrawerSkeleton /> : query.isError ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> : tab === 'overview' ? (
          <DetailList items={[
            { label: 'Plan', value: query.data.subscription.plan_name ?? humanize(query.data.subscription.plan) },
            { label: 'Status', value: <StatusBadge status={query.data.subscription.status} /> },
            { label: 'Amount', value: query.data.subscription.amount !== null ? formatMoney(query.data.subscription.amount, query.data.business.currency) : '—' },
            { label: 'Billing cycle', value: humanize(query.data.subscription.billing_period) },
            { label: 'Start date', value: formatDate(query.data.subscription.started_at) },
            { label: 'Expiry date', value: formatDate(query.data.subscription.ends_at) },
            { label: 'Days remaining', value: query.data.subscription.days_remaining === null ? '—' : String(Math.max(0, query.data.subscription.days_remaining)) },
            { label: 'Grace period ends', value: query.data.subscription.grace_ends_at ? formatDate(query.data.subscription.grace_ends_at) : '—' },
            { label: 'Unpaid balance', value: formatMoney(query.data.subscription.open_balance, query.data.business.currency) },
          ]} />
        ) : tab === 'payments' ? <PaymentHistory data={query.data} /> : <SubscriptionHistory data={query.data} />}
      </div>
    </Drawer>
  );
}

function PlanCatalog() {
  const plans = usePlans();
  const canWrite = useCan('billing:write');
  const [editing, setEditing] = useState<{ code?: string; name: string; monthly_price: number; description?: string | null; active: boolean } | null>(null);
  return (
    <Panel title="Plan catalog" icon={Tags} action={canWrite ? <AdminButton className="!min-h-9 !px-3 !text-xs" icon={Plus} onClick={() => setEditing({ name: '', monthly_price: 0, active: true })}>New plan</AdminButton> : undefined}>
      <Boundary query={plans} skeleton={<div className="space-y-2">{[0, 1, 2].map((i) => <span key={i} className="skeleton block h-12 rounded-xl" />)}</div>} compactError>
        {(data) => data.rows.length === 0 ? (
          <EmptyState icon={Tags} title="No paid plans configured">Every business is on Free until a plan is added. Prices are only set here, by a finance or super admin.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {data.rows.map((plan) => (
              <li key={plan.code} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0"><span className="flex items-center gap-2 text-sm font-semibold text-ink">{plan.name}{!plan.active ? <StatusBadge status="inactive" label="Hidden" /> : null}</span><span className="block text-xs text-muted">{formatMoney(plan.monthly_price, 'RWF')} / month · {formatNumber(plan.businesses)} business{plan.businesses === 1 ? '' : 'es'}</span></span>
                {canWrite ? <IconAction label={`Edit ${plan.name}`} icon={Pencil} onClick={() => setEditing({ ...plan })} /> : null}
              </li>
            ))}
          </ul>
        )}
      </Boundary>
      {editing ? <PlanDialog plan={editing} onClose={() => setEditing(null)} /> : null}
    </Panel>
  );
}

function PlanDialog({ plan, onClose }: { plan: { code?: string; name: string; monthly_price: number; description?: string | null; active: boolean }; onClose: () => void }) {
  const [form, setForm] = useState({ code: plan.code ?? '', name: plan.name, monthly_price: String(plan.monthly_price || ''), description: plan.description ?? '', active: plan.active });
  return (
    <ConfirmDialog title={plan.code ? `Edit ${plan.name}` : 'New plan'} confirmLabel={plan.code ? 'Save plan' : 'Create plan'} onClose={onClose} invalidate={INVALIDATE}
      description={plan.code ? 'Price changes apply to future renewals only. Existing invoices keep their amounts.' : 'Plans are shared by every business. Use a short code that never changes.'}
      run={(reason) => plan.code
        ? platformApi.patch(`/plans/${plan.code}`, { name: form.name, monthly_price: Number(form.monthly_price || 0), description: form.description || null, active: form.active, reason })
        : platformApi.post('/plans', { code: form.code, name: form.name, monthly_price: Number(form.monthly_price || 0), description: form.description || null, active: form.active, reason })}>
      <div className="space-y-3">
        {!plan.code ? <div><label className={labelClass} htmlFor="plan-code">Code</label><input id="plan-code" required pattern="[a-z0-9_\-]{2,40}" placeholder="essential" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase() })} className={fieldClass} /></div> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={labelClass} htmlFor="plan-name">Name</label><input id="plan-name" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={fieldClass} /></div>
          <div><label className={labelClass} htmlFor="plan-price">Monthly price (RWF)</label><input id="plan-price" inputMode="numeric" required value={form.monthly_price} onChange={(e) => setForm({ ...form, monthly_price: e.target.value.replace(/\D/g, '') })} className={fieldClass} /></div>
        </div>
        <div><label className={labelClass} htmlFor="plan-desc">Description</label><input id="plan-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={fieldClass} /></div>
        <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="h-4 w-4 accent-brand" />Available for new subscriptions</label>
      </div>
    </ConfirmDialog>
  );
}

type TrendRange = '30d' | '90d' | '6m' | '12m';

function SubscriptionTrend() {
  const [range, setRange] = useState<TrendRange>('6m');
  const query = useQuery({
    queryKey: ['platform-billing-trend', range],
    queryFn: async () => (await platformApi.get<{ bucket: string; rows: { day: string; registrations: number; renewals: number; expirations: number }[] }>('/billing/trend', { params: { range } })).data,
    placeholderData: keepPreviousData,
  });
  return (
    <Panel title="Subscription trend" icon={TrendingUp} className="xl:col-span-2"
      action={<Segmented label="Trend range" value={range} onChange={setRange} options={[{ value: '30d', label: '30 days' }, { value: '90d', label: '3 months' }, { value: '6m', label: '6 months' }, { value: '12m', label: '12 months' }]} />}>
      <Boundary query={query} skeleton={<SkeletonChart title={false} />} compactError>
        {(data) => (
          <div className={query.isFetching && !query.isPending ? 'opacity-60' : ''}>
            <CurveChart name="Subscription events" format={formatNumber} labels={data.rows.map((row) => bucketLabel(row.day, data.bucket))} series={[
              { name: 'New subscriptions', color: '#159b69', values: data.rows.map((row) => row.registrations) },
              { name: 'Renewals', color: '#3b82f6', values: data.rows.map((row) => row.renewals) },
              { name: 'Expirations', color: '#ef4444', values: data.rows.map((row) => row.expirations) },
            ]} />
          </div>
        )}
      </Boundary>
    </Panel>
  );
}

function PlanDistribution() {
  const query = useQuery({ queryKey: ['platform-overview', '30d'], queryFn: async () => (await platformApi.get<{ plans: { plan: string; name: string | null; count: number }[] }>('/overview', { params: { range: '30d' } })).data, staleTime: 60_000 });
  return (
    <Panel title="Subscriptions by plan" icon={PieChart}>
      <Boundary query={query} skeleton={<SkeletonDonut />} compactError>
        {(data) => <DonutChart centerLabel="Total" format={formatNumber} empty="No businesses yet." items={data.plans.map((row) => ({ label: row.name ?? humanize(row.plan), value: row.count }))} />}
      </Boundary>
    </Panel>
  );
}

const SKELETON_COLUMNS = [
  { width: 'w-32', kind: 'stack' as const }, { width: 'w-16', kind: 'badge' as const }, { width: 'w-20', align: 'right' as const }, { width: 'w-16' }, { width: 'w-20' }, { width: 'w-20' },
  { width: 'w-24' }, { width: 'w-16', kind: 'badge' as const }, { width: 'w-16', kind: 'actions' as const, align: 'right' as const },
];

export function SubscriptionsManagementSkeleton() {
  return (
    <LoadingRegion label="Loading subscriptions" className="space-y-6">
      <PageHeaderSkeleton actions={2} />
      <KpiGridSkeleton />
      <div className="grid gap-6 xl:grid-cols-3">
        <PanelSkeleton className="xl:col-span-2"><SkeletonChart title={false} /></PanelSkeleton>
        <PanelSkeleton><SkeletonDonut /></PanelSkeleton>
      </div>
      <TableCardSkeleton filters={3} columns={SKELETON_COLUMNS} headers={['Organization', 'Plan', 'Amount', 'Billing cycle', 'Start date', 'Expiry date', 'Grace period', 'Status', 'Actions']} />
    </LoadingRegion>
  );
}

export function SubscriptionsManagement() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState(params.get('status') ?? 'all');
  const [plan, setPlan] = useState('all');
  const [expires, setExpires] = useState('all');
  const plans = usePlans();
  const canWrite = useCan('billing:write');
  const list = useServerList<SubscriptionRow, Summary>({ key: 'platform-billing', path: '/billing', filters: { status, plan, expires_within: expires === 'all' ? undefined : expires }, defaultSort: { by: 'expiry', dir: 'asc' } });
  const [dialog, setDialog] = useState<{ action: SubscriptionAction; row?: SubscriptionRow } | null>(null);
  const [drawer, setDrawer] = useState<{ row: SubscriptionRow; tab: 'overview' | 'payments' | 'history' } | null>(null);
  if (list.query.isPending && !list.query.data) return <SubscriptionsManagementSkeleton />;
  const summary = list.query.data?.summary;
  const revenueGrowth = summary && summary.paid_prev_30d > 0 ? Math.round(((summary.paid_30d - summary.paid_prev_30d) / summary.paid_prev_30d) * 1000) / 10 : null;
  const actionsFor = (row: SubscriptionRow) => subscriptionActionsFor(row, canWrite, (action) => setDialog({ action, row }), [
    { label: 'View subscription', icon: Eye, onSelect: () => setDrawer({ row, tab: 'overview' }) },
    { label: 'View payment history', icon: Wallet, onSelect: () => setDrawer({ row, tab: 'payments' }) },
  ]);
  const columns: AdminColumn<SubscriptionRow>[] = [
    { key: 'name', header: 'Organization', sortKey: 'name', skeleton: { width: 'w-32', kind: 'stack' }, cell: (row) => <button type="button" onClick={() => setDrawer({ row, tab: 'overview' })} className="text-left"><span className="block font-semibold text-ink hover:underline">{row.name}</span><span className="block text-xs text-muted">{row.business_code}</span></button> },
    { key: 'plan', header: 'Plan', sortKey: 'plan', skeleton: { width: 'w-16', kind: 'badge' }, cell: (row) => <PlanBadge plan={row.plan} name={row.plan_name} /> },
    { key: 'amount', header: 'Amount', sortKey: 'amount', align: 'right', cell: (row) => row.plan_amount !== null ? formatMoney(row.plan_amount, row.currency) : row.plan === 'free' ? <span className="text-muted">Free</span> : <span className="text-muted">—</span> },
    { key: 'cycle', header: 'Billing cycle', hideBelow: 'lg', cell: (row) => humanize(row.billing_period) },
    { key: 'start', header: 'Start date', sortKey: 'start', hideBelow: 'lg', cell: (row) => <span className="whitespace-nowrap">{formatDate(row.subscription_started_at)}</span> },
    { key: 'expiry', header: 'Expiry date', sortKey: 'expiry', cell: (row) => <span className="whitespace-nowrap">{formatDate(row.ends_at)}</span> },
    { key: 'grace', header: 'Grace period', hideBelow: 'md', cell: (row) => <GraceCell endsAt={row.ends_at} status={row.effective_status} /> },
    { key: 'status', header: 'Status', sortKey: 'status', skeleton: { width: 'w-16', kind: 'badge' }, cell: (row) => <StatusBadge status={row.effective_status} /> },
    { key: 'actions', header: 'Actions', align: 'right', skeleton: { width: 'w-16', kind: 'actions', align: 'right' }, cell: (row) => <span className="inline-flex items-center gap-0.5"><IconAction label={`View ${row.name}`} icon={Eye} onClick={() => setDrawer({ row, tab: 'overview' })} /><ActionMenu label={`Subscription actions for ${row.name}`} actions={actionsFor(row).slice(1)} /></span> },
  ];
  return (
    <>
      <AdminPageHeader icon={CreditCard} title="Subscriptions" subtitle="Manage subscription plans and payments." refreshing={list.query.isFetching && !list.query.isPending}
        actions={<><FilterSelect label="Plan" value={plan} onChange={setPlan} options={planOptions(plans.data)} className="w-40" />{canWrite ? <AdminButton tone="primary" icon={Plus} onClick={() => setDialog({ action: 'change-plan' })}>Create subscription</AdminButton> : null}</>} />
      {summary ? (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard soft icon={CircleCheck} tone="green" label="Active subscriptions" value={formatNumber(summary.active)} hint={`${formatNumber(summary.trial)} on trial · ${formatNumber(summary.expiring_soon)} expiring soon`} />
          <KpiCard soft icon={CircleX} tone="violet" label="Expired" value={formatNumber(summary.expired)} hint={`${formatNumber(summary.grace)} in the ${GRACE_DAYS}-day grace period`} />
          <KpiCard soft icon={Hourglass} tone="amber" label="Pending payments" value={formatNumber(summary.pending_payments)} hint={summary.open_amount ? `${formatMoney(summary.open_amount, 'RWF')} unpaid` : 'No unpaid invoices'} />
          <KpiCard soft icon={Wallet} tone="blue" label="Payments recorded (30 days)" value={formatMoney(summary.paid_30d, 'RWF')} growth={revenueGrowth} growthLabel="vs previous 30 days" hint={summary.paid_invoices ? `${formatNumber(summary.paid_invoices)} paid invoices in total` : 'From invoices marked paid'} />
        </div>
      ) : list.query.isError ? null : <div className="mb-6"><KpiGridSkeleton /></div>}
      <div className="mb-6 grid gap-6 xl:grid-cols-3">
        <SubscriptionTrend />
        <PlanDistribution />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Panel bodyClass="" className="min-w-0">
          <TableToolbar>
            <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search by organization…" />
            <FilterSelect label="Status" value={status} onChange={setStatus} options={STATUS_FILTERS} />
            <FilterSelect label="Expiry" value={expires} onChange={setExpires} options={[{ value: 'all', label: 'Any expiry date' }, { value: '7', label: 'Expires in 7 days' }, { value: '30', label: 'Expires in 30 days' }, { value: '90', label: 'Expires in 90 days' }]} />
          </TableToolbar>
          <AdminTable<SubscriptionRow>
            {...list.tableProps}
            columns={columns}
            rowKey={(row) => row.id}
            noun="subscriptions"
            mobileCard={(row) => (
              <div className="flex items-start gap-3">
                <button type="button" onClick={() => setDrawer({ row, tab: 'overview' })} className="min-w-0 flex-1 text-left">
                  <span className="block truncate font-semibold text-ink">{row.name}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5"><PlanBadge plan={row.plan} name={row.plan_name} /><StatusBadge status={row.effective_status} /></span>
                  <span className="mt-1 block text-xs text-muted">Expires {formatDate(row.ends_at)}{row.plan_amount !== null ? ` · ${formatMoney(row.plan_amount, row.currency)}` : ''}</span>
                </button>
                <ActionMenu label={`Actions for ${row.name}`} actions={actionsFor(row)} />
              </div>
            )}
            empty={<EmptyState icon={CreditCard} title="No subscriptions match these filters" />}
          />
        </Panel>
        <div className="space-y-6">
          {summary ? (
            <Panel title="Subscription insights" icon={Lightbulb} className="border-amber-100 bg-amber-50/40">
              <ul className="space-y-2.5 text-sm">
                <li className="flex items-start gap-2"><CalendarClock size={16} className="mt-0.5 shrink-0 text-amber-600" /><span><strong>{formatNumber(summary.expiring_7d)}</strong> subscription{summary.expiring_7d === 1 ? '' : 's'} expire within the next 7 days.</span></li>
                <li className="flex items-start gap-2"><Hourglass size={16} className="mt-0.5 shrink-0 text-orange-600" /><span><strong>{formatNumber(summary.grace)}</strong> in the grace period. Access continues for {GRACE_DAYS} days after expiry.</span></li>
                <li className="flex items-start gap-2"><Receipt size={16} className="mt-0.5 shrink-0 text-violet-600" /><span><strong>{formatNumber(summary.open_invoices)}</strong> unpaid invoice{summary.open_invoices === 1 ? '' : 's'}.</span></li>
              </ul>
              {summary.expiring_7d ? <button type="button" onClick={() => { setExpires('7'); setStatus('all'); }} className="mt-3 text-sm font-semibold text-sky-600 hover:underline">Show expiring subscriptions</button> : null}
            </Panel>
          ) : null}
          <PlanCatalog />
        </div>
      </div>
      {dialog ? <SubscriptionManagementDialog businessId={dialog.row?.id} current={dialog.row} action={dialog.action} onClose={() => setDialog(null)} /> : null}
      {drawer ? <SubscriptionDetailsDrawer row={drawer.row} initialTab={drawer.tab} onClose={() => setDrawer(null)} /> : null}
    </>
  );
}
