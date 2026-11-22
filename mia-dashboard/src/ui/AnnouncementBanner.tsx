import { useState } from 'react';
import { AlertOctagon, AlertTriangle, Info, X } from 'lucide-react';

export type Announcement = { id: string; title: string; body: string; severity: 'info' | 'warning' | 'critical' };

const STYLES = {
  info: { box: 'bg-sky-50 text-sky-900 border-sky-100', icon: Info },
  warning: { box: 'bg-amber-50 text-amber-900 border-amber-100', icon: AlertTriangle },
  critical: { box: 'bg-rose-50 text-rose-900 border-rose-100', icon: AlertOctagon },
};

export function AnnouncementBanner({ announcements }: { announcements: Announcement[] }) {
  const [hidden, setHidden] = useState<string[]>([]);
  const visible = announcements.filter((a) => a.severity === 'critical' || !hidden.includes(a.id));
  if (visible.length === 0) return null;
  return (
    <>
      {visible.map((a) => {
        const style = STYLES[a.severity] ?? STYLES.info;
        const Icon = style.icon;
        return (
          <div key={a.id} role="status" className={`flex items-start gap-3 border-b px-4 py-2.5 text-sm sm:px-8 ${style.box}`}>
            <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
            <p className="min-w-0 flex-1"><span className="font-semibold">{a.title}: </span>{a.body}</p>
            {a.severity !== 'critical' ? (
              <button type="button" aria-label={`Hide announcement ${a.title}`} onClick={() => setHidden((ids) => [...ids, a.id])} className="-m-1 rounded p-1 opacity-60 hover:opacity-100"><X size={15} /></button>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
