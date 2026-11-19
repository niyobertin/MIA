import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { BarChart3, BellRing, CircleCheck, Eye, FileText, History, Mail, Megaphone, Monitor, RefreshCw, Send, Smartphone, TriangleAlert, Users } from 'lucide-react';
import { formatDateTime, formatNumber, humanize } from '../lib/format';
import { platformApi } from '../lib/platformAuth';
import { CurveChart } from '../ui/charts';
import { Select } from '../ui/Select';
import {
  ActionMenu, AdminButton, AdminPageHeader, AdminTable, Boundary, ConfirmDialog, Drawer, EmptyState, ErrorState, FilterSelect, KpiCard, Modal, Panel, SearchInput, Segmented, StatusBadge, TableToolbar,
  fieldClass, labelClass, timeAgo, useDebounced, useInvalidate, type AdminColumn,
} from './ui/admin';
import { DrawerSkeleton, FormSkeleton, KpiGridSkeleton, PanelSkeleton, SkeletonChart, SkeletonList } from './ui/skeleton';
import { useServerList } from './ui/useServerList';
import { formatDay } from '../lib/format';
import { useBusinessOptions } from './shared';
import { planOptions, usePlans } from './businesses';

type Audience = { type: 'all' | 'organizations' | 'plan' | 'status'; business_ids?: string[]; plan?: string; status?: string; user_ids?: string[]; recipients: 'owners' | 'all_users' };

function EmailPreview({ html, title }: { html: string; title: string }) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Preview</span>
        <div role="radiogroup" aria-label="Preview size" className="inline-flex rounded-lg bg-slate-100 p-0.5">
          {(['desktop', 'mobile'] as const).map((value) => (
            <button key={value} type="button" role="radio" aria-checked={device === value} onClick={() => setDevice(value)} className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${device === value ? 'bg-white text-ink shadow-sm' : 'text-muted'}`}>
              {value === 'desktop' ? <Monitor size={13} /> : <Smartphone size={13} />}{humanize(value)}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-center rounded-xl border border-line bg-slate-100 p-3">
        <iframe title={title} sandbox="" srcDoc={html} className="h-[520px] rounded-lg bg-white shadow-sm transition-[width]" style={{ width: device === 'mobile' ? 375 : '100%', maxWidth: '100%' }} />
      </div>
    </div>
  );
}

function AudiencePicker({ value, onChange }: { value: Audience; onChange: (value: Audience) => void }) {
  const businesses = useBusinessOptions();
  const plans = usePlans();
  const [filter, setFilter] = useState('');
  const singleOrg = value.type === 'organizations' && value.business_ids?.length === 1 ? value.business_ids[0] : null;
  const users = useQuery({
    queryKey: ['platform-audience-users', singleOrg],
    queryFn: async () => (await platformApi.get<{ rows: { id: string; name: string; email: string; role: string }[] }>('/email/audience/users', { params: { business_id: singleOrg } })).data.rows,
    enabled: Boolean(singleOrg),
  });
  const visible = (businesses.data ?? []).filter((row) => row.name.toLowerCase().includes(filter.toLowerCase()));
  const toggle = (id: string) => {
    const current = new Set(value.business_ids ?? []);
    if (current.has(id)) current.delete(id); else current.add(id);
    onChange({ ...value, business_ids: [...current], user_ids: undefined });
  };
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="aud-type">Send to</label>
          <Select id="aud-type" value={value.type} searchable={false} onChange={(type) => onChange({ type, recipients: value.recipients })} options={[
            { value: 'all', label: 'All registered organizations' }, { value: 'organizations', label: 'Selected organizations' }, { value: 'plan', label: 'Organizations on a plan' }, { value: 'status', label: 'Organizations by status' },
          ]} />
        </div>
        <div>
          <label className={labelClass} htmlFor="aud-recipients">Who in each organization</label>
          <Select id="aud-recipients" value={value.recipients} searchable={false} onChange={(recipients) => onChange({ ...value, recipients })} options={[{ value: 'owners', label: 'Owners only' }, { value: 'all_users', label: 'Every active user with an email' }]} />
        </div>
      </div>
      {value.type === 'plan' ? <div><label className={labelClass} htmlFor="aud-plan">Plan</label><Select id="aud-plan" value={value.plan ?? ''} onChange={(plan) => onChange({ ...value, plan })} options={planOptions(plans.data).filter((option) => option.value !== 'all')} /></div> : null}
      {value.type === 'status' ? <div><label className={labelClass} htmlFor="aud-status">Status</label><Select id="aud-status" value={value.status ?? ''} searchable={false} onChange={(status) => onChange({ ...value, status })} options={[{ value: 'active', label: 'Active' }, { value: 'trial', label: 'Trial' }, { value: 'suspended', label: 'Suspended' }, { value: 'expired', label: 'Expired subscriptions' }]} /></div> : null}
      {value.type === 'organizations' ? (
        <div className="rounded-xl border border-line">
          <div className="border-b border-line p-2"><input type="search" aria-label="Filter organizations" placeholder="Filter organizations…" value={filter} onChange={(e) => setFilter(e.target.value)} className={fieldClass} /></div>
          <ul className="max-h-48 overflow-y-auto p-1">
            {businesses.isPending ? <li className="p-2"><SkeletonList rows={3} /></li> : visible.map((row) => (
              <li key={row.id}><label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-slate-50"><input type="checkbox" checked={value.business_ids?.includes(row.id) ?? false} onChange={() => toggle(row.id)} className="h-4 w-4 accent-brand" /><span className="flex-1 truncate text-ink">{row.name}</span><span className="text-xs text-muted">{row.business_code}</span></label></li>
            ))}
          </ul>
          <div className="border-t border-line px-3 py-2 text-xs text-muted">{value.business_ids?.length ?? 0} selected</div>
        </div>
      ) : null}
      {singleOrg ? (
        <div className="rounded-xl border border-line p-3">
          <div className="mb-2 text-xs font-semibold text-muted">Optional: choose individual people in this organization</div>
          {users.isPending ? <SkeletonList rows={2} /> : (users.data ?? []).length === 0 ? <p className="text-sm text-muted">No active users with an email.</p> : (
            <div className="flex flex-wrap gap-1.5">
              {users.data!.map((user) => {
                const on = value.user_ids?.includes(user.id) ?? false;
                return <button key={user.id} type="button" aria-pressed={on} onClick={() => { const set = new Set(value.user_ids ?? []); if (on) set.delete(user.id); else set.add(user.id); onChange({ ...value, user_ids: [...set] }); }} className={`rounded-full border px-3 py-1 text-xs font-medium ${on ? 'border-brand bg-brand-soft text-brand-dark' : 'border-line text-ink/80 hover:bg-slate-50'}`}>{user.name} · {humanize(user.role)}</button>;
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function useAudienceCount(audience: Audience) {
  const key = useDebounced(JSON.stringify(audience), 350);
  const parsed = JSON.parse(key) as Audience;
  const ready = parsed.type === 'all' || (parsed.type === 'organizations' && (parsed.business_ids?.length ?? 0) > 0) || (parsed.type === 'plan' && parsed.plan) || (parsed.type === 'status' && parsed.status);
  return useQuery({
    queryKey: ['platform-audience', key],
    queryFn: async () => (await platformApi.post<{ recipients: number; organizations: number; sample_organizations: string[] }>('/email/audience/preview', { audience: parsed })).data,
    enabled: Boolean(ready),
    placeholderData: keepPreviousData,
  });
}

export function ComposeEmail() {
  const [audience, setAudience] = useState<Audience>({ type: 'organizations', business_ids: [], recipients: 'owners' });
  const [form, setForm] = useState({ subject: '', heading: '', body: 'Hello {{recipient_name}},\n\n', action_label: '', action_url: '', category: 'announcements', schedule: '' });
  const [confirming, setConfirming] = useState(false);
  const [sent, setSent] = useState<{ recipients: number; organizations: number; scheduled: boolean } | null>(null);
  const count = useAudienceCount(audience);
  const refresh = useInvalidate();
  const content = { subject: form.subject, heading: form.heading || form.subject, body: form.body.replace(/^Hello \{\{recipient_name\}\},\n\n/, ''), action_label: form.action_label || null, action_url: form.action_url || null };
  const debouncedContent = useDebounced(JSON.stringify(content), 500);
  const preview = useQuery({
    queryKey: ['platform-email-preview', debouncedContent],
    queryFn: async () => (await platformApi.post<{ preview: { html: string; subject: string } }>('/email/preview', JSON.parse(debouncedContent))).data.preview,
    enabled: content.subject.length >= 3 && content.body.trim().length >= 3,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const test = useMutation({ mutationFn: async () => (await platformApi.post<{ sent_to: string }>('/email/test', content)).data });
  const submit = (event: FormEvent) => { event.preventDefault(); setConfirming(true); };
  if (sent) {
    return (
      <>
        <AdminPageHeader icon={Send} title="Compose email" subtitle="Send a branded email to organizations on MIA." />
        <Panel><EmptyState icon={CircleCheck} title={sent.scheduled ? 'Email scheduled' : 'Email is being sent'}>{formatNumber(sent.recipients)} recipients in {formatNumber(sent.organizations)} organizations. Each person gets their own copy. Track delivery in Email history.<div className="mt-4 flex justify-center gap-2"><AdminButton onClick={() => setSent(null)}>Write another</AdminButton></div></EmptyState></Panel>
      </>
    );
  }
  return (
    <>
      <AdminPageHeader icon={Send} title="Compose email" subtitle="Send a branded email to organizations on MIA. Recipients never see each other's addresses." />
      <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="space-y-6">
          <Panel title="Recipients" icon={Users}>
            <AudiencePicker value={audience} onChange={setAudience} />
            <div className="mt-4 flex items-center gap-3 rounded-xl bg-brand-soft/60 px-4 py-3 text-sm">
              <Users size={16} className="text-brand" />
              {count.isFetching && !count.data ? <span className="skeleton block h-4 w-40 rounded" /> : count.data ? <span><strong>{formatNumber(count.data.recipients)}</strong> recipients in <strong>{formatNumber(count.data.organizations)}</strong> organizations</span> : <span className="text-muted">Choose who should receive this.</span>}
            </div>
          </Panel>
          <Panel title="Message" icon={Mail}>
            <div className="space-y-3">
              <div><label className={labelClass} htmlFor="c-subject">Subject</label><input id="c-subject" required minLength={3} maxLength={200} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className={fieldClass} /></div>
              <div><label className={labelClass} htmlFor="c-heading">Heading <span className="font-normal text-muted">(defaults to the subject)</span></label><input id="c-heading" maxLength={200} value={form.heading} onChange={(e) => setForm({ ...form, heading: e.target.value })} className={fieldClass} /></div>
              <div><label className={labelClass} htmlFor="c-body">Body</label><textarea id="c-body" required rows={8} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className={`${fieldClass} font-mono text-[13px]`} /><p className="mt-1 text-xs text-muted">Leave a blank line between paragraphs. Variables: {'{{recipient_name}} {{organization_name}} {{subscription_plan}} {{support_email}}'}</p></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className={labelClass} htmlFor="c-label">Button label</label><input id="c-label" maxLength={60} value={form.action_label} onChange={(e) => setForm({ ...form, action_label: e.target.value })} className={fieldClass} /></div>
                <div><label className={labelClass} htmlFor="c-url">Button link</label><input id="c-url" type="url" placeholder="https://" value={form.action_url} onChange={(e) => setForm({ ...form, action_url: e.target.value })} className={fieldClass} /></div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className={labelClass} htmlFor="c-cat">Category</label><Select id="c-cat" value={form.category} searchable={false} onChange={(category) => setForm({ ...form, category })} options={[{ value: 'announcements', label: 'Announcement' }, { value: 'operations', label: 'Platform operations' }, { value: 'subscriptions', label: 'Subscriptions' }, { value: 'security', label: 'Security' }]} /></div>
                <div><label className={labelClass} htmlFor="c-when">Send at <span className="font-normal text-muted">(empty sends now)</span></label><input id="c-when" type="datetime-local" value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} className={fieldClass} /></div>
              </div>
            </div>
          </Panel>
          {test.isError ? <ErrorState error={test.error} compact /> : null}
          {test.data ? <div role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Test email queued to {test.data.sent_to}.</div> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <AdminButton type="button" icon={Mail} disabled={test.isPending || content.subject.length < 3} onClick={() => test.mutate()}>{test.isPending ? 'Sending test…' : 'Send test to me'}</AdminButton>
            <AdminButton type="submit" tone="primary" icon={Send} disabled={!count.data?.recipients}>{form.schedule ? 'Schedule' : 'Send now'}</AdminButton>
          </div>
        </div>
        <Panel title="Preview" icon={Eye}>
          {preview.isError ? <ErrorState error={preview.error} compact /> : preview.data ? <EmailPreview html={preview.data.html} title="Email preview" /> : preview.isFetching ? <div className="skeleton h-[560px] rounded-xl" /> : <EmptyState icon={Eye} title="Write a subject and body to see the email" />}
        </Panel>
      </form>
      {confirming ? (
        <ConfirmDialog
          title={audience.type === 'all' ? 'Send to every organization?' : 'Send this email?'}
          tone={audience.type === 'all' ? 'danger' : 'primary'}
          confirmLabel={form.schedule ? 'Schedule email' : `Send to ${formatNumber(count.data?.recipients ?? 0)} people`}
          description={<><strong>{form.subject}</strong> goes to {formatNumber(count.data?.recipients ?? 0)} recipients in {formatNumber(count.data?.organizations ?? 0)} organizations{form.schedule ? ` at ${formatDateTime(new Date(form.schedule))}` : ''}. This cannot be undone once sending starts.</>}
          onClose={() => setConfirming(false)}
          invalidate={['platform-campaigns', 'platform-email-messages']}
          run={async (reason) => {
            const { data } = await platformApi.post<{ recipients: number; organizations: number }>('/email/campaigns', { ...content, audience, category: form.category, scheduled_for: form.schedule ? new Date(form.schedule).toISOString() : null, confirm_all: audience.type === 'all', reason });
            setSent({ ...data, scheduled: Boolean(form.schedule) });
            await refresh(['platform-campaigns']);
          }}
        />
      ) : null}
    </>
  );
}

type TemplateRow = { key: string; category: string; name: string; description: string; subject: string; active: boolean; customized: boolean; updated_at: string | null; required: string[]; sensitive: boolean; transactional: boolean; locale: string };

function TemplateEditor({ templateKey, locale, onClose }: { templateKey: string; locale: string; onClose: () => void }) {
  const query = useQuery({ queryKey: ['platform-template', templateKey, locale], queryFn: async () => (await platformApi.get<{ template: TemplateRow & { heading: string; body: string; action_label?: string | null; locale: string }; preview: { html: string } }>(`/email/templates/${templateKey}`, { params: { locale } })).data });
  const [form, setForm] = useState<{ subject: string; heading: string; body: string; action_label: string; active: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (query.data && !form) setForm({ subject: query.data.template.subject, heading: query.data.template.heading, body: query.data.template.body, action_label: query.data.template.action_label ?? '', active: query.data.template.active });
  }, [query.data, form]);
  const debounced = useDebounced(JSON.stringify(form), 450);
  const preview = useQuery({
    queryKey: ['platform-template-preview', templateKey, debounced],
    queryFn: async () => { const f = JSON.parse(debounced); return (await platformApi.post<{ preview: { html: string } }>(`/email/templates/${templateKey}/preview`, { subject: f.subject, heading: f.heading, body: f.body, action_label: f.action_label || null })).data.preview; },
    enabled: Boolean(form),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const test = useMutation({ mutationFn: async () => (await platformApi.post<{ sent_to: string }>(`/email/templates/${templateKey}/test`, { locale, ...form, action_label: form?.action_label || null })).data });
  return (
    <Drawer title={query.data?.template.name ?? 'Template'} subtitle={query.data ? `${humanize(query.data.template.category)} · ${locale === 'rw' ? 'Kinyarwanda' : 'English'}${query.data.template.locale !== locale ? ' (falls back to English)' : ''}` : undefined} onClose={onClose}
      footer={form ? <div className="flex flex-wrap justify-end gap-2"><AdminButton icon={Mail} disabled={test.isPending} onClick={() => test.mutate()}>{test.isPending ? 'Sending…' : 'Send test'}</AdminButton><AdminButton tone="primary" onClick={() => setSaving(true)}>Save template</AdminButton></div> : undefined}>
      {query.isPending || !form ? <FormSkeleton fields={4} /> : query.isError ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> : (
        <div className="space-y-4">
          <p className="text-sm text-muted">{query.data.template.description}</p>
          {query.data.template.sensitive ? <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900"><TriangleAlert size={14} className="mt-0.5 shrink-0" />Security code email. It cannot be turned off, the code is never stored, and the body is not kept in email history.</div> : null}
          <div><label className={labelClass} htmlFor="t-subject">Subject</label><input id="t-subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className={fieldClass} /></div>
          <div><label className={labelClass} htmlFor="t-heading">Heading</label><input id="t-heading" value={form.heading} onChange={(e) => setForm({ ...form, heading: e.target.value })} className={fieldClass} /></div>
          <div><label className={labelClass} htmlFor="t-body">Body</label><textarea id="t-body" rows={7} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className={`${fieldClass} font-mono text-[13px]`} /></div>
          <div><label className={labelClass} htmlFor="t-action">Button label</label><input id="t-action" value={form.action_label} onChange={(e) => setForm({ ...form, action_label: e.target.value })} className={fieldClass} /></div>
          <div className="text-xs text-muted">Required: {query.data.template.required.map((name) => <code key={name} className="mr-1 rounded bg-slate-100 px-1">{`{{${name}}}`}</code>)}</div>
          <label className={`flex items-center gap-2 text-sm ${query.data.template.sensitive ? 'opacity-50' : ''}`}><input type="checkbox" checked={form.active} disabled={query.data.template.sensitive} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="h-4 w-4 accent-brand" />Active (sent automatically)</label>
          {test.isError ? <ErrorState error={test.error} compact /> : null}
          {test.data ? <div role="status" className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800">Test queued to {test.data.sent_to}.</div> : null}
          {preview.isError ? <ErrorState error={preview.error} compact /> : preview.data ? <EmailPreview html={preview.data.html} title="Template preview" /> : <div className="skeleton h-[520px] rounded-xl" />}
        </div>
      )}
      {saving && form ? <ConfirmDialog title="Save template" confirmLabel="Save" onClose={() => setSaving(false)} invalidate={['platform-templates', 'platform-template']} onDone={onClose} run={(reason) => platformApi.put(`/email/templates/${templateKey}`, { ...form, action_label: form.action_label || null, locale, reason })} /> : null}
    </Drawer>
  );
}

export function EmailTemplates() {
  const [locale, setLocale] = useState('en');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const query = useQuery({ queryKey: ['platform-templates', locale], queryFn: async () => (await platformApi.get<{ rows: TemplateRow[] }>('/email/templates', { params: { locale } })).data.rows });
  const rows = useMemo(() => (query.data ?? []).filter((row) => (category === 'all' || row.category === category) && `${row.name} ${row.subject} ${row.key}`.toLowerCase().includes(search.toLowerCase())), [query.data, category, search]);
  return (
    <>
      <AdminPageHeader icon={FileText} title="Email templates" subtitle="Branded emails MIA sends automatically. Edit wording, preview on desktop and mobile, and send yourself a test." />
      <Panel bodyClass="">
        <TableToolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search templates…" />
          <FilterSelect label="Category" value={category} onChange={setCategory} options={[{ value: 'all', label: 'All categories' }, { value: 'authentication', label: 'Authentication' }, { value: 'users', label: 'User management' }, { value: 'businesses', label: 'Business management' }, { value: 'subscriptions', label: 'Subscriptions' }, { value: 'platform', label: 'Platform communication' }]} />
          <Segmented label="Language" value={locale} onChange={setLocale} options={[{ value: 'en', label: 'English' }, { value: 'rw', label: 'Kinyarwanda' }]} />
        </TableToolbar>
        {query.isPending ? <div className="p-5"><SkeletonList rows={8} /></div> : query.isError ? <div className="p-4"><ErrorState error={query.error} onRetry={() => query.refetch()} /></div> : rows.length === 0 ? <EmptyState icon={FileText} title="No templates match" /> : (
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <li key={row.key}>
                <button type="button" onClick={() => setEditing(row.key)} className="flex w-full flex-wrap items-center gap-3 px-5 py-3.5 text-left hover:bg-slate-50 sm:flex-nowrap">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand"><Mail size={16} /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{row.name}</span><span className="block truncate text-xs text-muted">{row.subject}</span></span>
                  <span className="text-xs text-muted">{humanize(row.category)}</span>
                  {row.customized ? <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">Edited{row.locale !== locale ? ' (English)' : ''}</span> : null}
                  <StatusBadge status={row.active ? 'active' : 'inactive'} label={row.active ? 'Active' : 'Off'} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {editing ? <TemplateEditor templateKey={editing} locale={locale} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

type MessageRow = { id: string; template_key: string | null; category: string; to_email: string; to_name: string | null; business_id: string | null; business_name: string | null; campaign_id: string | null; subject: string; status: string; attempts: number; last_error: string | null; sensitive: boolean; created_at: string; sent_at: string | null; delivered_at: string | null };
const STATUS_LABELS: Record<string, string> = { sent: 'Sent to provider', queued: 'Queued', processing: 'Processing', delivered: 'Delivered', bounced: 'Bounced', failed: 'Failed', suppressed: 'Suppressed' };

function MessageDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const query = useQuery({ queryKey: ['platform-email-message', id], queryFn: async () => (await platformApi.get<{ message: MessageRow & { html: string | null; provider_message_id: string | null; next_attempt_at: string | null } }>(`/email/messages/${id}`)).data.message });
  return (
    <Drawer title={query.data?.subject ?? 'Email'} subtitle={query.data?.to_email} onClose={onClose}>
      {query.isPending ? <DrawerSkeleton /> : query.isError ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> : (
        <div className="space-y-4 text-sm">
          <div className="flex items-center gap-2"><StatusBadge status={query.data.status} label={STATUS_LABELS[query.data.status]} /><span className="text-xs text-muted">{query.data.attempts} attempt{query.data.attempts === 1 ? '' : 's'}</span></div>
          <dl className="grid grid-cols-2 gap-3 text-xs">
            <div><dt className="text-muted">Created</dt><dd className="font-medium text-ink">{formatDateTime(query.data.created_at)}</dd></div>
            <div><dt className="text-muted">Sent to provider</dt><dd className="font-medium text-ink">{formatDateTime(query.data.sent_at)}</dd></div>
            <div><dt className="text-muted">Delivered (provider confirmed)</dt><dd className="font-medium text-ink">{formatDateTime(query.data.delivered_at)}</dd></div>
            <div><dt className="text-muted">Provider ID</dt><dd className="break-all font-mono text-ink">{query.data.provider_message_id ?? '—'}</dd></div>
          </dl>
          {query.data.last_error ? <div className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800"><strong>Error:</strong> {query.data.last_error}</div> : null}
          {query.data.html ? <EmailPreview html={query.data.html} title="Sent email" /> : <p className="rounded-xl bg-slate-50 px-3.5 py-3 text-xs text-muted">{query.data.sensitive ? 'Security emails are not stored, so the code can never be read back.' : 'No body stored.'}</p>}
        </div>
      )}
    </Drawer>
  );
}

export function EmailHistory() {
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('all');
  const [open, setOpen] = useState<string | null>(null);
  const [retry, setRetry] = useState<MessageRow | null>(null);
  const list = useServerList<MessageRow>({ key: 'platform-email-messages', path: '/email/messages', filters: { status, category }, defaultSort: { by: 'date', dir: 'desc' } });
  const campaigns = useQuery({ queryKey: ['platform-campaigns'], queryFn: async () => (await platformApi.get<{ rows: { id: string; subject: string; status: string; recipient_count: number; sent: number; delivered: number; failed: number; pending: number; scheduled_for: string; admin_email: string; created_at: string }[] }>('/email/campaigns')).data.rows, refetchInterval: 15_000 });
  const columns: AdminColumn<MessageRow>[] = [
    { key: 'to', header: 'Recipient', cell: (row) => <span className="min-w-0"><span className="block truncate font-medium text-ink">{row.to_name ?? row.to_email}</span><span className="block truncate text-xs text-muted">{row.to_email}</span></span> },
    { key: 'subject', header: 'Subject', cell: (row) => <span className="block max-w-xs truncate">{row.subject}</span> },
    { key: 'category', header: 'Category', hideBelow: 'lg', cell: (row) => humanize(row.category) },
    { key: 'org', header: 'Organization', hideBelow: 'lg', cell: (row) => row.business_name ?? <span className="text-muted">—</span> },
    { key: 'date', header: 'Sent', cell: (row) => <span className="whitespace-nowrap text-xs" title={formatDateTime(row.created_at)}>{timeAgo(row.sent_at ?? row.created_at)}</span> },
    { key: 'status', header: 'Status', skeleton: { width: 'w-16', kind: 'badge' }, cell: (row) => <span className="flex flex-col items-start gap-0.5"><StatusBadge status={row.status === 'sent' ? 'operational' : row.status} label={STATUS_LABELS[row.status]} />{row.last_error ? <span className="max-w-[12rem] truncate text-[11px] text-rose-700" title={row.last_error}>{row.last_error}</span> : null}</span> },
    { key: 'actions', header: '', align: 'right', cell: (row) => <ActionMenu label={`Actions for email to ${row.to_email}`} actions={[{ label: 'Inspect', icon: Eye, onSelect: () => setOpen(row.id) }, { label: 'Retry', icon: RefreshCw, onSelect: () => setRetry(row), hidden: row.status !== 'failed' || row.sensitive }]} /> },
  ];
  return (
    <>
      <AdminPageHeader icon={History} title="Email history" subtitle="Every email MIA sends. “Sent to provider” is not proof of delivery; “Delivered” only appears when the provider confirms it." refreshing={list.query.isFetching && !list.query.isPending} />
      <Panel title="Campaigns" icon={Send} className="mb-6">
        <Boundary query={campaigns} skeleton={<SkeletonList rows={2} />} compactError>
          {(rows) => rows.length === 0 ? <EmptyState icon={Send} title="No campaigns yet" /> : (
            <ul className="divide-y divide-line">
              {rows.slice(0, 6).map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0"><span className="block truncate font-semibold text-ink">{row.subject}</span><span className="block text-xs text-muted">{row.admin_email} · {row.status === 'scheduled' ? `scheduled for ${formatDateTime(row.scheduled_for)}` : timeAgo(row.created_at)}</span></span>
                  <span className="flex items-center gap-3 text-xs text-muted"><span>{formatNumber(row.recipient_count)} recipients</span><span className="text-emerald-700">{formatNumber(row.sent)} sent</span>{row.failed ? <span className="text-rose-700">{formatNumber(row.failed)} failed</span> : null}{row.pending ? <span>{formatNumber(row.pending)} waiting</span> : null}<StatusBadge status={row.status === 'completed' ? 'active' : row.status === 'cancelled' ? 'cancelled' : 'trial'} label={humanize(row.status)} /></span>
                </li>
              ))}
            </ul>
          )}
        </Boundary>
      </Panel>
      <Panel bodyClass="">
        <TableToolbar>
          <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search recipient, subject or organization…" />
          <FilterSelect label="Status" value={status} onChange={setStatus} options={[{ value: 'all', label: 'All statuses' }, ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))]} />
          <FilterSelect label="Category" value={category} onChange={setCategory} options={[{ value: 'all', label: 'All categories' }, ...['authentication', 'users', 'businesses', 'subscriptions', 'platform', 'announcements', 'operations', 'security', 'test'].map((value) => ({ value, label: humanize(value) }))]} />
        </TableToolbar>
        <AdminTable<MessageRow> {...list.tableProps} sort={undefined} onSort={undefined} columns={columns} rowKey={(row) => row.id} noun="emails" onRowClick={(row) => setOpen(row.id)} empty={<EmptyState icon={Mail} title="No emails match" />} />
      </Panel>
      {open ? <MessageDrawer id={open} onClose={() => setOpen(null)} /> : null}
      {retry ? <ConfirmDialog title={`Retry email to ${retry.to_email}`} needsReason={false} confirmLabel="Retry" description="The email is queued again with a fresh set of attempts." onClose={() => setRetry(null)} invalidate={['platform-email-messages']} run={() => platformApi.post(`/email/messages/${retry.id}/retry`)} /> : null}
    </>
  );
}

export function DeliveryAnalytics() {
  const [days, setDays] = useState('30');
  const query = useQuery({ queryKey: ['platform-email-analytics', days], queryFn: async () => (await platformApi.get<{ totals: Record<string, number>; webhooks_configured: boolean; provider_configured: boolean; rates: { accepted: number | null; delivered: number | null; bounced: number | null }; by_category: { category: string; total: number; sent: number; failed: number }[]; series: { day: string; sent: number; delivered: number; failed: number }[] }>('/email/analytics', { params: { days } })).data, placeholderData: keepPreviousData });
  return (
    <>
      <AdminPageHeader icon={BarChart3} title="Delivery analytics" subtitle="How MIA's emails are doing." refreshing={query.isFetching && !query.isPending} actions={<Segmented label="Period" value={days} onChange={setDays} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />} />
      {query.isPending ? <div className="space-y-6"><KpiGridSkeleton /><PanelSkeleton><SkeletonChart title={false} /></PanelSkeleton></div> : query.isError ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> : (
        <div className="space-y-6">
          {!query.data.provider_configured ? <div role="alert" className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><TriangleAlert size={16} />No email provider is configured (SMTP_HOST). In development emails are printed to the API log; production cannot send.</div> : null}
          {!query.data.webhooks_configured ? <div className="flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-3 text-sm text-muted"><TriangleAlert size={16} className="text-amber-600" />Provider delivery webhooks are not configured (EMAIL_WEBHOOK_SECRET), so no email can be marked delivered or bounced yet.</div> : null}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard icon={Send} tone="blue" label="Emails" value={formatNumber(query.data.totals.total)} hint={`${formatNumber(query.data.totals.queued + query.data.totals.processing)} waiting`} />
            <KpiCard icon={CircleCheck} tone="green" label="Accepted by provider" value={query.data.rates.accepted === null ? '—' : `${query.data.rates.accepted}%`} hint={`${formatNumber(query.data.totals.sent + query.data.totals.delivered)} emails`} />
            <KpiCard icon={Mail} tone="violet" label="Delivered (confirmed)" value={query.data.rates.delivered === null ? '—' : `${query.data.rates.delivered}%`} hint={query.data.webhooks_configured ? `${formatNumber(query.data.totals.delivered)} confirmed` : 'Needs provider webhooks'} />
            <KpiCard icon={TriangleAlert} tone="red" label="Failed or bounced" value={formatNumber(query.data.totals.failed + query.data.totals.bounced)} hint={`${formatNumber(query.data.totals.suppressed)} suppressed`} />
          </div>
          <div className="grid gap-6 xl:grid-cols-3">
            <Panel title="Emails per day" icon={BarChart3} className="xl:col-span-2">
              <CurveChart name="Emails" format={formatNumber} labels={query.data.series.map((row) => formatDay(row.day))} series={[{ name: 'Sent', color: '#159b69', values: query.data.series.map((row) => row.sent) }, { name: 'Delivered', color: '#3b82f6', values: query.data.series.map((row) => row.delivered) }, { name: 'Failed', color: '#ef4444', values: query.data.series.map((row) => row.failed) }]} />
            </Panel>
            <Panel title="By category" icon={FileText}>
              {query.data.by_category.length === 0 ? <EmptyState icon={Mail} title="No emails in this period" /> : <ul className="space-y-3">{query.data.by_category.map((row) => <li key={row.category} className="flex items-center justify-between gap-3 text-sm"><span className="font-medium text-ink">{humanize(row.category)}</span><span className="text-xs text-muted">{formatNumber(row.sent)} sent{row.failed ? ` · ${formatNumber(row.failed)} failed` : ''}</span></li>)}</ul>}
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}

type AnnouncementRow = { id: string; title: string; body: string; severity: string; business_name: string | null; starts_at: string; ends_at: string | null; active: boolean; channels: string; published_at: string | null; recipient_count: number; delivered_in_app: number; read_count: number; emails_sent: number; created_at: string };

function NewAnnouncement({ onClose }: { onClose: () => void }) {
  const [audience, setAudience] = useState<Audience>({ type: 'all', recipients: 'all_users' });
  const [form, setForm] = useState({ title: '', body: '', severity: 'info', channels: 'in_app', template: 'platform.announcement', starts_at: '', ends_at: '' });
  const count = useAudienceCount(audience);
  const refresh = useInvalidate();
  const mutation = useMutation({
    mutationFn: () => platformApi.post('/announcements', { ...form, audience, starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null, ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null, confirm_all: audience.type === 'all' }),
    onSuccess: async () => { await refresh(['announcements', 'platform-campaigns']); onClose(); },
  });
  return (
    <Modal title="New announcement" onClose={onClose} wide>
      <form onSubmit={(event) => { event.preventDefault(); if (!mutation.isPending) mutation.mutate(); }} className="space-y-4">
        <div><label className={labelClass} htmlFor="an-title">Title</label><input id="an-title" required minLength={3} maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={fieldClass} /></div>
        <div><label className={labelClass} htmlFor="an-body">Message</label><textarea id="an-body" required minLength={3} maxLength={1000} rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className={fieldClass} /></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className={labelClass} htmlFor="an-sev">Priority</label><Select id="an-sev" value={form.severity} searchable={false} onChange={(severity) => setForm({ ...form, severity })} options={[{ value: 'info', label: 'Information' }, { value: 'warning', label: 'Warning' }, { value: 'critical', label: 'Critical' }]} /></div>
          <div><label className={labelClass} htmlFor="an-ch">Deliver by</label><Select id="an-ch" value={form.channels} searchable={false} onChange={(channels) => setForm({ ...form, channels })} options={[{ value: 'in_app', label: 'In-app notification' }, { value: 'email', label: 'Email' }, { value: 'both', label: 'Both' }]} /></div>
          <div><label className={labelClass} htmlFor="an-tpl">Email style</label><Select id="an-tpl" value={form.template} searchable={false} onChange={(template) => setForm({ ...form, template })} options={[{ value: 'platform.announcement', label: 'Announcement' }, { value: 'platform.maintenance', label: 'Scheduled maintenance' }, { value: 'platform.feature', label: 'New feature' }, { value: 'platform.policy', label: 'Policy update' }, { value: 'platform.interruption', label: 'Service interruption' }, { value: 'platform.restored', label: 'Service restored' }, { value: 'platform.security_advisory', label: 'Security advisory' }]} /></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={labelClass} htmlFor="an-start">Publish at <span className="font-normal text-muted">(empty publishes now)</span></label><input id="an-start" type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} className={fieldClass} /></div>
          <div><label className={labelClass} htmlFor="an-end">Expires at</label><input id="an-end" type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} className={fieldClass} /></div>
        </div>
        <AudiencePicker value={audience} onChange={setAudience} />
        <div className="rounded-xl bg-brand-soft/60 px-4 py-2.5 text-sm">{count.data ? <>Email reaches <strong>{formatNumber(count.data.recipients)}</strong> people in <strong>{formatNumber(count.data.organizations)}</strong> organizations. In-app goes to every matching active user.</> : 'Choose an audience.'}</div>
        {audience.type === 'all' && form.channels !== 'in_app' ? <p className="text-sm font-medium text-rose-700">This emails every organization on MIA.</p> : null}
        {mutation.isError ? <ErrorState error={mutation.error} compact /> : null}
        <div className="flex justify-end gap-2"><AdminButton type="button" onClick={onClose}>Cancel</AdminButton><AdminButton type="submit" tone="primary" disabled={mutation.isPending}>{mutation.isPending ? 'Publishing…' : form.starts_at ? 'Schedule' : 'Publish'}</AdminButton></div>
      </form>
    </Modal>
  );
}

export function AnnouncementsPage() {
  const [creating, setCreating] = useState(false);
  const [ending, setEnding] = useState<AnnouncementRow | null>(null);
  const query = useQuery({ queryKey: ['announcements'], queryFn: async () => (await platformApi.get<{ rows: AnnouncementRow[] }>('/announcements')).data.rows });
  return (
    <>
      <AdminPageHeader icon={Megaphone} title="Announcements" subtitle="Publish to organizations in the app, by email, or both." actions={<AdminButton tone="primary" icon={Megaphone} onClick={() => setCreating(true)}>New announcement</AdminButton>} />
      <Panel bodyClass="">
        {query.isPending ? <div className="p-5"><SkeletonList rows={5} /></div> : query.isError ? <div className="p-4"><ErrorState error={query.error} onRetry={() => query.refetch()} /></div> : query.data.length === 0 ? <EmptyState icon={BellRing} title="No announcements yet" /> : (
          <ul className="divide-y divide-line">
            {query.data.map((row) => {
              const scheduled = !row.published_at && new Date(row.starts_at) > new Date();
              return (
                <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-ink">{row.title}</span><StatusBadge status={!row.active ? 'cancelled' : scheduled ? 'trial' : 'active'} label={!row.active ? 'Ended' : scheduled ? `Scheduled ${formatDateTime(row.starts_at)}` : 'Live'} /><StatusBadge status={row.severity === 'critical' ? 'expired' : row.severity === 'warning' ? 'expiring_soon' : 'inactive'} label={humanize(row.severity)} /></div>
                    <p className="mt-0.5 line-clamp-2 text-sm text-muted">{row.body}</p>
                    <p className="mt-1 text-xs text-muted">{row.business_name ?? 'All organizations'} · {row.channels === 'both' ? 'In-app and email' : row.channels === 'email' ? 'Email' : 'In-app'}{row.ends_at ? ` · expires ${formatDateTime(row.ends_at)}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted">
                    {row.channels !== 'email' ? <span>{formatNumber(row.delivered_in_app)} in-app · {formatNumber(row.read_count)} read</span> : null}
                    {row.channels !== 'in_app' ? <span>{formatNumber(row.emails_sent)} emails sent</span> : null}
                    {row.active ? <AdminButton className="!min-h-8 !px-3 !text-xs" onClick={() => setEnding(row)}>End</AdminButton> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      {creating ? <NewAnnouncement onClose={() => setCreating(false)} /> : null}
      {ending ? <ConfirmDialog title={`End “${ending.title}”`} needsReason={false} confirmLabel="End announcement" description="It stops showing, and any scheduled email for it is cancelled." onClose={() => setEnding(null)} invalidate={['announcements']} run={() => platformApi.patch(`/announcements/${ending.id}`, { active: false })} /> : null}
    </>
  );
}
