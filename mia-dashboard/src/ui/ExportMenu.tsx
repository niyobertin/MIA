import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { getErrorMessage } from '../lib/format';
import { exportReport, type ExportFormat } from '../lib/exportData';
import type { ReportPdfInput } from '../lib/pdf';

export function ExportMenu({ build, disabled = false, label = 'Export' }: { build: () => Promise<ReportPdfInput> | ReportPdfInput; disabled?: boolean; label?: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<unknown>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const run = async (format: ExportFormat) => {
    setOpen(false);
    setBusy(format);
    setError(null);
    try {
      await exportReport(format, await build());
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(null);
    }
  };

  const item = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-ink hover:bg-slate-50 focus:bg-slate-100 focus:outline-none';
  return (
    <div ref={ref} className="relative inline-flex flex-col items-end">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled || busy !== null}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Download size={16} aria-hidden />}
        {busy ? (busy === 'pdf' ? 'Making PDF…' : 'Making Excel…') : label}
        <ChevronDown size={14} aria-hidden className="text-slate-400" />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-full z-40 mt-1 w-52 rounded-xl border border-line bg-white p-1.5 shadow-xl">
          <button role="menuitem" type="button" className={item} onClick={() => void run('pdf')}><FileText size={15} className="text-rose-600" aria-hidden />PDF document</button>
          <button role="menuitem" type="button" className={item} onClick={() => void run('xlsx')}><FileSpreadsheet size={15} className="text-emerald-700" aria-hidden />Excel spreadsheet</button>
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-1 max-w-xs text-right text-xs text-rose-700">{getErrorMessage(error, 'Could not export. Try again.')}</p> : null}
    </div>
  );
}
