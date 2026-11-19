import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Eye, Headset, Lock, ShieldAlert, Siren, Wrench } from 'lucide-react';
import { formatDateTime } from '../lib/format';
import { platformApi } from '../lib/platformAuth';
import { Select } from '../ui/Select';
import { Link } from 'react-router-dom';
import { AdminButton, AdminPageHeader, EmptyState, ErrorState, Modal, Panel, StatusBadge, fieldClass, labelClass, useInvalidate } from './ui/admin';
import { SkeletonList } from './ui/skeleton';
import { BusinessPicker } from './shared';
import { useAdmin } from './context';

export type Grant = { id: string; admin_name: string; admin_id: string; business_id: string; business_name: string; reason: string; level: number; expires_at: string; revoked_at: string | null; created_at: string; actions: number };

export const LEVELS = [
  { level: 1, name: 'Monitoring', icon: Eye, maxMinutes: 60, superOnly: false, description: 'Status, sync health and technical signals. No business records.' },
  { level: 2, name: 'Read-only support', icon: Headset, maxMinutes: 60, superOnly: false, description: 'Read business records. Customer contact details stay masked.' },
  { level: 3, name: 'Administrative support', icon: Wrench, maxMinutes: 30, superOnly: true, description: 'Approved troubleshooting and business profile changes.' },
  { level: 4, name: 'Emergency access', icon: Siren, maxMinutes: 15, superOnly: true, description: 'Time-limited exceptional access, including customer contact details. Needs your password.' },
];

export const grantActive = (grant: Pick<Grant, 'revoked_at' | 'expires_at'>) => !grant.revoked_at && new Date(grant.expires_at) > new Date();

export function useGrants(businessId?: string) {
  return useQuery({
    queryKey: ['support-grants', businessId ?? 'all'],
    queryFn: async () => (await platformApi.get<{ rows: Grant[] }>('/support/grants', { params: { business_id: businessId } })).data.rows,
    refetchInterval: 30_000,
  });
}

export function useMyActiveGrant(businessId: string) {
  const admin = useAdmin();
  const grants = useGrants(businessId);
  const mine = (grants.data ?? []).filter((grant) => grant.admin_id === admin.id && grantActive(grant)).sort((a, b) => b.level - a.level);
  return { grant: mine[0] ?? null, query: grants };
}

export function SupportAccessDialog({ businessId: initialBusiness, businessName, onClose, minLevel = 1 }: { businessId?: string; businessName?: string; onClose: () => void; minLevel?: number }) {
  const admin = useAdmin();
  const [businessId, setBusinessId] = useState(initialBusiness ?? '');
  const [level, setLevel] = useState(Math.max(minLevel, 2));
  const [minutes, setMinutes] = useState('30');
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const refresh = useInvalidate();
  const definition = LEVELS.find((item) => item.level === level)!;
  const mutation = useMutation({
    mutationFn: () => platformApi.post('/support/grants', { business_id: businessId, level, minutes: Math.min(Number(minutes), definition.maxMinutes), reason, ...(level === 4 ? { password } : {}) }),
    onSuccess: async () => { await refresh(['support-grants', 'platform-audit', 'support-view']); onClose(); },
  });
  const submit = (event: FormEvent) => { event.preventDefault(); if (!mutation.isPending) mutation.mutate(); };
  return (
    <Modal title={`Request support access${businessName ? `: ${businessName}` : ''}`} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-muted">Access is time-limited, every view is logged, and the owner is told who you are and why. There is no hidden or unrestricted access.</p>
        {!initialBusiness ? <div><label className={labelClass} htmlFor="grant-org">Organization</label><BusinessPicker id="grant-org" value={businessId} onChange={setBusinessId} /></div> : null}
        <fieldset>
          <legend className={labelClass}>Access level</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {LEVELS.map((item) => {
              const blocked = item.superOnly && admin.role !== 'SUPER_ADMIN';
              return (
                <label key={item.level} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${level === item.level ? 'border-brand bg-brand-soft/60 ring-1 ring-brand' : 'border-line hover:bg-slate-50'} ${blocked || item.level < minLevel ? 'cursor-not-allowed opacity-50' : ''}`}>
                  <input type="radio" name="level" value={item.level} checked={level === item.level} disabled={blocked || item.level < minLevel} onChange={() => { setLevel(item.level); if (Number(minutes) > item.maxMinutes) setMinutes(String(item.maxMinutes)); }} className="sr-only" />
                  <item.icon size={18} className={`mt-0.5 shrink-0 ${item.level === 4 ? 'text-rose-600' : 'text-brand'}`} />
                  <span className="min-w-0"><span className="block text-sm font-semibold text-ink">Level {item.level}: {item.name}</span><span className="block text-xs text-muted">{item.description}{blocked ? ' Super admins only.' : ''}</span></span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={labelClass} htmlFor="grant-minutes">Length</label><Select id="grant-minutes" value={minutes} onChange={setMinutes} searchable={false} options={[15, 30, 60].filter((value) => value <= definition.maxMinutes).map((value) => ({ value: String(value), label: `${value} minutes` }))} /></div>
          {level === 4 ? <div><label className={labelClass} htmlFor="grant-password">Confirm your password</label><input id="grant-password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={fieldClass} /></div> : null}
        </div>
        <div><label className={labelClass} htmlFor="grant-reason">Reason <span className="font-normal text-muted">(the owner sees this)</span></label><textarea id="grant-reason" required minLength={5} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={fieldClass} /></div>
        {level >= 3 ? <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900"><ShieldAlert size={16} className="mt-0.5 shrink-0" />Other super admins are notified when level {level} access starts.</div> : null}
        {mutation.isError ? <ErrorState error={mutation.error} compact /> : null}
        <div className="flex justify-end gap-2"><AdminButton type="button" onClick={onClose}>Cancel</AdminButton><AdminButton type="submit" tone={level === 4 ? 'danger' : 'primary'} disabled={mutation.isPending || !businessId}>{mutation.isPending ? 'Starting…' : 'Start session'}</AdminButton></div>
      </form>
    </Modal>
  );
}

export function SupportBanner({ grant }: { grant: Grant }) {
  const refresh = useInvalidate();
  const end = useMutation({ mutationFn: () => platformApi.post(`/support/grants/${grant.id}/revoke`), onSuccess: () => refresh(['support-grants', 'support-view', 'platform-audit']) });
  const definition = LEVELS.find((item) => item.level === grant.level) ?? LEVELS[1];
  return (
    <div role="status" className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${grant.level === 4 ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
      <span className="flex items-center gap-2"><Lock size={16} /><span><strong>Support session active, level {grant.level} ({definition.name}).</strong> Ends {formatDateTime(grant.expires_at)}. Every view is logged ({grant.actions} so far).</span></span>
      <AdminButton tone="danger" className="!min-h-9" onClick={() => end.mutate()} disabled={end.isPending}>{end.isPending ? 'Ending…' : 'End access now'}</AdminButton>
    </div>
  );
}

export function SupportAccessPage() {
  const admin = useAdmin();
  const grants = useGrants();
  const [open, setOpen] = useState(false);
  const refresh = useInvalidate();
  const end = useMutation({ mutationFn: (id: string) => platformApi.post(`/support/grants/${id}/revoke`), onSuccess: () => refresh(['support-grants', 'support-view']) });
  return (
    <>
      <AdminPageHeader icon={Headset} title="Support access" subtitle="Controlled, time-limited access to one organization. The owner is told, and every view is logged."
        actions={<AdminButton tone="primary" icon={Headset} onClick={() => setOpen(true)}>Request access</AdminButton>} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {LEVELS.map((item) => (
          <div key={item.level} className="rounded-2xl border border-line bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-ink"><item.icon size={16} className={item.level === 4 ? 'text-rose-600' : 'text-brand'} />Level {item.level}: {item.name}</div>
            <p className="mt-1 text-xs text-muted">{item.description}</p>
            <p className="mt-2 text-[11px] font-semibold text-muted">Up to {item.maxMinutes} minutes{item.superOnly ? ' · super admins only' : ''}</p>
          </div>
        ))}
      </div>
      <Panel title="Sessions" icon={Headset} bodyClass="">
        {grants.isPending ? <div className="p-5"><SkeletonList rows={4} /></div> : grants.isError ? <div className="p-4"><ErrorState error={grants.error} onRetry={() => grants.refetch()} /></div> : grants.data.length === 0 ? <EmptyState icon={Headset} title="No support sessions yet" /> : (
          <ul className="divide-y divide-line">
            {grants.data.map((grant) => {
              const active = grantActive(grant);
              return (
                <li key={grant.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><Link to={`/platform/businesses/${grant.business_id}/activity`} className="font-semibold text-ink hover:underline">{grant.business_name}</Link><StatusBadge status={active ? (grant.level === 4 ? 'expired' : 'trial') : 'cancelled'} label={active ? `Active · level ${grant.level}` : `Ended · level ${grant.level}`} /></div>
                    <div className="text-xs text-muted">{grant.admin_name} · {formatDateTime(grant.created_at)} → {formatDateTime(grant.revoked_at ?? grant.expires_at)} · {grant.actions} logged action{grant.actions === 1 ? '' : 's'}</div>
                    <div className="mt-0.5 max-w-2xl text-xs text-ink/80">{grant.reason}</div>
                  </div>
                  {active && (grant.admin_id === admin.id || admin.role === 'SUPER_ADMIN') ? <AdminButton tone="danger" className="!min-h-9" disabled={end.isPending} onClick={() => end.mutate(grant.id)}>End access</AdminButton> : null}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      {open ? <SupportAccessDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}
