import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, AlertTriangle, Bell, CalendarClock, Info, Sun } from 'lucide-react';
import { formatDateTime } from '../lib/format';
import { useOutsideClose } from '../ui/Shell';
import type { Me } from './useMe';

function DayStatusPill({ day }: { day: Me['day'] }) {
  const open = day.open;
  return (
    <Link
      to="/day"
      title={open ? `Opened ${formatDateTime(day.opened_at)}` : 'Start the day before selling'}
      className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-semibold ring-1 ring-inset transition-colors ${open ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100' : 'bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100'}`}
    >
      <span className="relative flex h-2.5 w-2.5" aria-hidden>
        {open ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" /> : null}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${open ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      </span>
      <span className="hidden md:inline">{open ? `Day #${day.session_number} open` : 'Day not open'}</span>
      <span className="sr-only md:hidden">{open ? `Day ${day.session_number} is open` : 'The day is not open'}</span>
    </Link>
  );
}

const SEVERITY = {
  info: { icon: Info, tone: 'bg-sky-50 text-sky-700' },
  warning: { icon: AlertTriangle, tone: 'bg-amber-50 text-amber-700' },
  critical: { icon: AlertOctagon, tone: 'bg-rose-50 text-rose-700' },
};

function NotificationsBell({ me }: { me: Me }) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  const needsDay = !me.day.open && (me.permissions.includes('salesCreate') || me.permissions.includes('dayOpen'));
  const count = me.announcements.length + (needsDay ? 1 : 0);
  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" aria-haspopup="dialog" aria-expanded={open} aria-label={`Notifications${count ? `, ${count} unread` : ''}`} onClick={() => setOpen((v) => !v)} className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100">
        <Bell size={20} aria-hidden />
        {count > 0 ? <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">{count}</span> : null}
      </button>
      {open ? (
        <div role="dialog" aria-label="Notifications" className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-line bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-bold text-ink">Notifications</span>
            {count ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">{count}</span> : null}
          </div>
          <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
            {needsDay ? (
              <li>
                <Link to="/day" onClick={() => setOpen(false)} className="flex gap-3 px-4 py-3 hover:bg-slate-50">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><Sun size={17} aria-hidden /></span>
                  <span className="min-w-0"><span className="block text-sm font-semibold text-ink">The day is not open</span><span className="block text-xs text-muted">Start it before selling or recording money.</span></span>
                </Link>
              </li>
            ) : null}
            {me.announcements.map((a) => {
              const style = SEVERITY[a.severity] ?? SEVERITY.info;
              const Icon = style.icon;
              return (
                <li key={a.id} className="flex gap-3 px-4 py-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style.tone}`}><Icon size={17} aria-hidden /></span>
                  <span className="min-w-0"><span className="block text-sm font-semibold text-ink">{a.title}</span><span className="block text-xs text-muted">{a.body}</span></span>
                </li>
              );
            })}
            {count === 0 ? (
              <li className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-slate-300"><CalendarClock size={20} aria-hidden /></span>
                You're all caught up.
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function BusinessHeaderActions({ me }: { me: Me }) {
  return (
    <>
      <DayStatusPill day={me.day} />
      <NotificationsBell me={me} />
    </>
  );
}
