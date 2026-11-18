import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

export type SelectOption<T extends string = string> = { value: T; label: string; hint?: string };

export function Select<T extends string = string>({
  id,
  value,
  onChange,
  options,
  ariaLabel,
  placeholder = 'Choose…',
  disabled = false,
  required = false,
  size = 'md',
  className = '',
  searchable = true,
}: {
  id?: string;
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  searchable?: boolean;
}) {
  const autoId = useId();
  const buttonId = id ?? `select-${autoId}`;
  const listId = `${buttonId}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState('');
  const [placement, setPlacement] = useState({ up: false, right: false });
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.value === value) ?? null;
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? options.filter((option) => `${option.label} ${option.hint ?? ''}`.toLowerCase().includes(needle))
    : options;

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  useEffect(() => {
    if (open && searchable) searchRef.current?.focus();
  }, [open, searchable]);

  const openList = () => {
    if (disabled) return;
    const index = options.findIndex((option) => option.value === value);
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom;
      setPlacement({ up: below < 320 && rect.top > below, right: rect.left + 352 > window.innerWidth });
    }
    setQuery('');
    setActive(index >= 0 ? index : 0);
    setOpen(true);
  };

  const closeList = (refocus = true) => {
    setOpen(false);
    setQuery('');
    if (refocus) document.getElementById(buttonId)?.focus();
  };

  const choose = (index: number) => {
    const option = visible[index];
    if (!option) return;
    onChange(option.value);
    closeList();
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeList();
    } else if (event.key === 'Tab') {
      closeList(false);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(visible.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(active);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        openList();
      }
      return;
    }
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') event.preventDefault();
      setOpen(false);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(visible.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActive(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActive(visible.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(active);
    } else if (event.key.length === 1 && visible.length > 0) {
      const start = (active + 1) % visible.length;
      const letter = event.key.toLowerCase();
      for (let step = 0; step < visible.length; step += 1) {
        const index = (start + step) % visible.length;
        if (visible[index].label.toLowerCase().startsWith(letter)) {
          setActive(index);
          break;
        }
      }
    }
  };

  const pad = size === 'sm' ? 'py-1.5 pl-3 pr-2.5 text-sm' : 'py-2 pl-3 pr-2.5 text-sm';

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        id={buttonId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        aria-activedescendant={open && !searchable && visible[active] ? `${listId}-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border bg-white ${pad} text-left font-medium shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ${open ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-slate-200 hover:border-slate-300'}`}
      >
        <span className={`truncate ${selected ? 'text-slate-900' : 'text-slate-400'}`}>{selected?.label ?? placeholder}</span>
        <ChevronDown size={16} className={`shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {required ? (
        <input
          tabIndex={-1}
          aria-hidden
          required
          value={selected ? String(selected.value) : ''}
          onChange={() => undefined}
          onFocus={() => document.getElementById(buttonId)?.focus()}
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px opacity-0"
        />
      ) : null}
      {open ? (
        <div className={`absolute ${placement.up ? 'bottom-full mb-1.5' : 'top-full mt-1.5'} ${placement.right ? 'right-0' : 'left-0'} z-30 w-max min-w-full max-w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-900/10`}>
          {searchable ? (
            <div className="relative border-b border-slate-100 p-1.5">
              <Search size={14} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                ref={searchRef}
                type="search"
                role="searchbox"
                aria-label={`Search ${ariaLabel ?? 'options'}`}
                aria-controls={listId}
                aria-activedescendant={visible[active] ? `${listId}-${active}` : undefined}
                placeholder="Search…"
                value={query}
                onChange={(event) => { setQuery(event.target.value); setActive(0); }}
                onKeyDown={onSearchKeyDown}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2 text-sm text-slate-900 focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </div>
          ) : null}
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-labelledby={buttonId}
            className="max-h-64 overflow-auto p-1"
          >
            {visible.length === 0 ? <li className="px-2.5 py-2 text-sm text-slate-500">No matches</li> : null}
            {visible.map((option, index) => {
              const isSelected = option.value === value;
              const isActive = index === active;
              return (
                <li
                  key={option.value}
                  id={`${listId}-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(index)}
                  className={`flex cursor-pointer items-center justify-between gap-3 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm ${isActive ? 'bg-emerald-50 text-emerald-900' : 'text-slate-700'} ${isSelected ? 'font-semibold' : ''}`}
                >
                  <span>
                    {option.label}
                    {option.hint ? <span className="block text-xs font-normal text-slate-500">{option.hint}</span> : null}
                  </span>
                  {isSelected ? <Check size={16} className="shrink-0 text-emerald-700" aria-hidden /> : <span className="w-4" />}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
