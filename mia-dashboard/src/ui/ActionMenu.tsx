import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { MoreHorizontal, type LucideIcon } from 'lucide-react';

export type MenuAction = { label: string; icon?: LucideIcon; onSelect: () => void; tone?: 'danger'; hidden?: boolean; href?: string; disabled?: boolean };

const MENU_WIDTH = 224;

export function ActionMenu({ label, actions }: { label: string; actions: MenuAction[] }) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const visible = actions.filter((action) => !action.hidden);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const place = () => {
      const rect = buttonRef.current!.getBoundingClientRect();
      const height = menuRef.current?.offsetHeight ?? 0;
      const below = rect.bottom + 4 + height <= window.innerHeight - 8;
      const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
      setStyle({ position: 'fixed', left, width: MENU_WIDTH, top: below ? rect.bottom + 4 : Math.max(8, rect.top - 4 - height) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { const target = event.target as Node; if (!ref.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (visible.length === 0) return null;

  const onKey = (event: KeyboardEvent) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); }
    if (event.key === 'ArrowDown') { event.preventDefault(); items[(index + 1) % items.length]?.focus(); }
    if (event.key === 'ArrowUp') { event.preventDefault(); items[(index - 1 + items.length) % items.length]?.focus(); }
  };

  return (
    <div ref={ref} className="relative inline-block text-left" onKeyDown={onKey}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-ink ${open ? 'bg-slate-100 text-ink' : ''}`}
      >
        <MoreHorizontal size={18} />
      </button>
      {open ? createPortal(
        <div ref={menuRef} role="menu" style={{ position: 'fixed', top: -9999, left: -9999, width: MENU_WIDTH, ...style }} className="z-50 rounded-xl border border-line bg-white p-1.5 shadow-xl">
          {visible.map((action) => {
            const className = `flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium focus:bg-slate-100 focus:outline-none hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 ${action.tone === 'danger' ? 'text-rose-700' : 'text-ink'}`;
            const content = <>{action.icon ? <action.icon size={15} className="shrink-0 opacity-70" /> : null}{action.label}</>;
            return action.href
              ? <Link key={action.label} role="menuitem" to={action.href} className={className} onClick={() => setOpen(false)}>{content}</Link>
              : <button key={action.label} role="menuitem" type="button" disabled={action.disabled} className={className} onClick={() => { setOpen(false); action.onSelect(); }}>{content}</button>;
          })}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
