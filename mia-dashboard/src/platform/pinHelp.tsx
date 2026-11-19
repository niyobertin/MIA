import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { formatDateTime, humanize } from '../lib/format';
import { platformApi } from '../lib/platformAuth';
import { Badge, Button, Card, DataTable, Dialog, PageHeader, QueryBoundary, ReasonAction } from '../ui/kit';
import { useCan } from './context';
import { Select } from '../ui/Select';

type HelpRequest = {
  id: string;
  identifier: string;
  name: string;
  contact_phone: string | null;
  message: string | null;
  status: 'open' | 'resolved' | 'rejected';
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  user_phone: string | null;
  user_role: string | null;
  user_active: boolean | null;
  business_name: string | null;
};

function TemporaryPinDialog({ pin, name, onClose }: { pin: string; name: string; onClose: () => void }) {
  return (
    <Dialog title={`Temporary PIN for ${name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-50 py-6 text-center font-mono text-4xl font-bold tracking-[0.4em] text-slate-900">{pin}</div>
        <p className="text-sm text-slate-600">
          Tell them this PIN on the phone call. It is shown only once. When they sign in, the app makes them choose a new PIN.
        </p>
        <div className="flex justify-end">
          <Button tone="primary" onClick={onClose}>Done</Button>
        </div>
      </div>
    </Dialog>
  );
}

function RequestActions({ row }: { row: HelpRequest }) {
  const [issued, setIssued] = useState<string | null>(null);
  const invalidate = ['platform-pin-help'];
  const canIssue = row.user_id && row.user_active;
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {canIssue ? (
        <ReasonAction
          label="Give temporary PIN"
          tone="primary"
          title={`Give ${row.user_name ?? row.name} a temporary PIN`}
          description={`First call ${row.contact_phone ?? 'them'} and confirm who they are, for example by asking their business name and role. Write how you checked below.`}
          invalidate={invalidate}
          run={(reason) => platformApi.post<{ pin: string }>(`/pin-help/${row.id}/temporary-pin`, { reason })}
          onDone={(result) => setIssued((result as { data: { pin: string } }).data.pin)}
        />
      ) : null}
      <ReasonAction
        label="Close"
        title="Close this request"
        description="Use this when you could not confirm who they are, or the request is a duplicate."
        invalidate={invalidate}
        run={(reason) => platformApi.post(`/pin-help/${row.id}/close`, { reason })}
      />
      {issued ? <TemporaryPinDialog pin={issued} name={row.user_name ?? row.name} onClose={() => setIssued(null)} /> : null}
    </div>
  );
}

function accountCell(row: HelpRequest) {
  if (!row.user_id) return <Badge tone="warn">No matching account</Badge>;
  return (
    <div>
      <div className="font-semibold text-slate-900">{row.user_name}</div>
      <div className="text-xs text-slate-500">{[row.user_phone, row.user_email].filter(Boolean).join(' · ')}</div>
      <div className="text-xs text-slate-500">{row.business_name ?? 'No business'} · {humanize(row.user_role ?? 'none')}</div>
      {row.user_active === false ? <Badge tone="bad">Deactivated</Badge> : null}
    </div>
  );
}

export function PinHelpRequests() {
  const canManage = useCan('users:manage');
  const [status, setStatus] = useState<'open' | 'resolved' | 'rejected'>('open');
  const query = useQuery({
    queryKey: ['platform-pin-help', status],
    queryFn: async () => (await platformApi.get<{ rows: HelpRequest[] }>('/pin-help', { params: { status } })).data.rows,
    refetchInterval: 60_000,
  });
  return (
    <>
      <PageHeader
        title="PIN help requests"
        subtitle="People who forgot their PIN and have no email. Call them, confirm who they are, then give a temporary PIN."
        action={(
          <Select ariaLabel="Filter by status" className="w-40" value={status} onChange={(v) => setStatus(v as typeof status)} options={[{ value: 'open', label: 'Open' }, { value: 'resolved', label: 'Resolved' }, { value: 'rejected', label: 'Closed' }]} />
        )}
      />
      <Card>
        <QueryBoundary query={query}>
          {(rows) => (
            <DataTable<HelpRequest>
              rows={rows}
              rowKey={(row) => row.id}
              empty={status === 'open' ? 'No one is waiting for help.' : 'Nothing here yet.'}
              columns={[
                {
                  header: 'Requested by',
                  cell: (row) => (
                    <div>
                      <div className="font-semibold text-slate-900">{row.name}</div>
                      <div className="text-xs text-slate-500">Signs in with {row.identifier}</div>
                      {row.contact_phone ? <a href={`tel:${row.contact_phone}`} className="text-xs font-semibold text-emerald-700 hover:underline">Call {row.contact_phone}</a> : null}
                      {row.message ? <div className="mt-1 max-w-xs whitespace-normal text-xs text-slate-600">“{row.message}”</div> : null}
                    </div>
                  ),
                },
                { header: 'Account', cell: accountCell },
                { header: 'When', cell: (row) => <span className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(row.created_at)}</span> },
                ...(status === 'open'
                  ? (canManage ? [{ header: 'Actions', align: 'right' as const, cell: (row: HelpRequest) => <RequestActions row={row} /> }] : [])
                  : [{ header: 'Note', cell: (row: HelpRequest) => <span className="max-w-xs whitespace-normal text-xs text-slate-600">{row.resolution_note}</span> }]),
              ]}
            />
          )}
        </QueryBoundary>
      </Card>
      {status === 'open' ? (
        <p className="mt-3 text-xs text-slate-500">
          Staff members can also get a new PIN from their business owner in the app, under Team. <Link to="/platform/users" className="underline">User accounts</Link>
        </p>
      ) : null}
    </>
  );
}
