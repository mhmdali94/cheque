import { useId, useState } from 'react';
import { Field, INPUT_CLASS } from './controls';

interface ComboboxProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  hint?: string;
  error?: string;
  placeholder?: string;
}

/** حقل نص حر مع قائمة اقتراحات، يشتغل بالكيبورد واللمس. */
export function Combobox({ label, value, onChange, options, hint, error, placeholder }: ComboboxProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const query = value.trim();
  const matches = options.filter((o) => o !== value && (query === '' || o.includes(query))).slice(0, 8);
  const showList = open && matches.length > 0;

  const choose = (option: string) => {
    onChange(option);
    setOpen(false);
    setActive(-1);
  };

  return (
    <Field label={label} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <input
            id={id} dir="rtl" lang="ar" role="combobox" autoComplete="off" className={INPUT_CLASS} value={value}
            placeholder={placeholder} aria-describedby={describedBy} aria-invalid={invalid}
            aria-expanded={showList} aria-controls={listId} aria-autocomplete="list"
            aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1); }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              if (!showList) return;
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const step = e.key === 'ArrowDown' ? 1 : -1;
                setActive((i) => (i + step + matches.length) % matches.length);
              } else if (e.key === 'Enter' && active >= 0) {
                e.preventDefault();
                choose(matches[active]);
              }
            }}
          />
          <ul
            id={listId} role="listbox" aria-label={label} hidden={!showList}
            className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-rule-strong bg-surface py-1 shadow-lg"
          >
            {matches.map((option, index) => (
              <li
                key={option} id={`${listId}-${index}`} role="option" aria-selected={index === active}
                className={`min-h-11 px-3 py-2.5 ${index === active ? 'bg-accent-tint' : 'hover:bg-sunken'}`}
                onPointerDown={(e) => { e.preventDefault(); choose(option); }}
              >
                {option}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Field>
  );
}
