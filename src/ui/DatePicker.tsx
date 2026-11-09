import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import {
  ARABIC_MONTHS, ARABIC_WEEKDAYS, daysInMonth, firstWeekdayOfMonth, formatDate, parseIsoDate, toIsoDate, todayIso,
} from '@/core/date';
import { toArabicDigits } from '@/core/digits';
import { INPUT_CLASS } from './controls';

interface DatePickerProps {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  hint?: string;
}

/** منتقي تاريخ عربي: منتقي المتصفح بيظهر بلغة الجهاز. */
export function DatePicker({ label, value, onChange, hint }: DatePickerProps) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = parseIsoDate(value) ?? parseIsoDate(todayIso())!;
  const [view, setView] = useState({ year: selected.year, month: selected.month });
  const [focusDay, setFocusDay] = useState(selected.day);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  useEffect(() => {
    if (open) gridRef.current?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus();
  }, [open, view, focusDay]);

  const shiftMonth = (delta: number) => {
    const index = view.year * 12 + view.month - 1 + delta;
    const next = { year: Math.floor(index / 12), month: (index % 12) + 1 };
    setView(next);
    setFocusDay((d) => Math.min(d, daysInMonth(next.year, next.month)));
  };

  const toggle = () => {
    if (!open) {
      setView({ year: selected.year, month: selected.month });
      setFocusDay(selected.day);
    }
    setOpen(!open);
  };

  const pick = (day: number) => {
    onChange(toIsoDate(view.year, view.month, day));
    setOpen(false);
  };

  const total = daysInMonth(view.year, view.month);
  const moveFocus = (delta: number) => {
    const next = focusDay + delta;
    if (next < 1) {
      shiftMonth(-1);
      const index = view.year * 12 + view.month - 2;
      setFocusDay(daysInMonth(Math.floor(index / 12), (index % 12) + 1) + next);
    } else if (next > total) {
      shiftMonth(1);
      setFocusDay(next - total);
    } else {
      setFocusDay(next);
    }
  };

  const onGridKey = (event: KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowLeft: 1, ArrowRight: -1, ArrowUp: -7, ArrowDown: 7 };
    if (event.key in moves) {
      event.preventDefault();
      moveFocus(moves[event.key]);
    } else if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault();
      shiftMonth(event.key === 'PageUp' ? -1 : 1);
    }
  };

  const today = todayIso();
  const offset = firstWeekdayOfMonth(view.year, view.month);
  const navClass = 'flex size-11 items-center justify-center rounded-md text-lg text-ink-soft hover:bg-sunken hover:text-ink';

  return (
    <div
      ref={rootRef} className="relative flex flex-col gap-1"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          setOpen(false);
          rootRef.current?.querySelector('button')?.focus();
        }
      }}
    >
      <span id={`${id}-label`} className="text-sm font-semibold">{label}</span>
      <button
        type="button" className={`${INPUT_CLASS} text-start tabular-nums`} aria-haspopup="dialog" aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`} aria-describedby={hint ? `${id}-hint` : undefined} onClick={toggle}
      >
        <span id={`${id}-value`} dir="ltr">{formatDate(value) || 'اختار'}</span>
      </button>

      {hint && <p id={`${id}-hint`} className="text-sm text-ink-soft">{hint}</p>}

      {open && (
        <div role="dialog" aria-label={label} className="absolute top-[4.75rem] z-30 mt-1 w-[19.5rem] max-w-[calc(100vw-2rem)] rounded-md border border-rule-strong bg-surface p-3 shadow-lg">
          <div className="flex items-center justify-between">
            <button type="button" aria-label="الشهر السابق" className={navClass} onClick={() => shiftMonth(-1)}>›</button>
            <p aria-live="polite" className="font-bold">{ARABIC_MONTHS[view.month - 1]} {toArabicDigits(view.year)}</p>
            <button type="button" aria-label="الشهر التالي" className={navClass} onClick={() => shiftMonth(1)}>‹</button>
          </div>

          <div ref={gridRef} role="grid" onKeyDown={onGridKey} className="mt-2 grid grid-cols-7 text-center">
            {ARABIC_WEEKDAYS.map((day) => (
              <span key={day} role="columnheader" aria-label={day} className="pb-1 text-xs text-ink-soft">{day.replace('ال', '').slice(0, 3)}</span>
            ))}
            {Array.from({ length: offset }, (_, i) => <span key={`gap-${i}`} />)}
            {Array.from({ length: total }, (_, i) => i + 1).map((day) => {
              const iso = toIsoDate(view.year, view.month, day);
              const isSelected = iso === value;
              return (
                <button
                  key={day} type="button" tabIndex={day === focusDay ? 0 : -1} aria-pressed={isSelected}
                  aria-label={`${toArabicDigits(day)} ${ARABIC_MONTHS[view.month - 1]}`}
                  className={`aspect-square min-h-10 rounded-md text-sm tabular-nums transition-colors duration-100 ${
                    isSelected ? 'bg-accent font-bold text-on-accent'
                      : iso === today ? 'font-bold text-accent hover:bg-sunken' : 'hover:bg-sunken'
                  }`}
                  onClick={() => pick(day)}
                >
                  {toArabicDigits(day)}
                </button>
              );
            })}
          </div>

          <button
            type="button" className="mt-2 min-h-11 w-full rounded-md text-sm font-semibold text-accent hover:bg-sunken"
            onClick={() => { onChange(today); setOpen(false); }}
          >
            النهارده
          </button>
        </div>
      )}
    </div>
  );
}
