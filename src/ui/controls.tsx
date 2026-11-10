import {
  useId, useLayoutEffect, useRef,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes,
} from 'react';
import { toArabicDigits } from '@/core/digits';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BUTTON_BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors duration-150 disabled:opacity-50';

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-strong',
  secondary: 'border border-rule-strong bg-surface text-ink hover:bg-sunken',
  ghost: 'text-ink-soft hover:bg-sunken hover:text-ink',
  danger: 'border border-danger text-danger hover:bg-danger-tint',
};

export function Button({
  variant = 'secondary', className = '', type = 'button', ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type={type} className={`${BUTTON_BASE} ${BUTTON_VARIANT[variant]} ${className}`} {...props} />;
}

export const INPUT_CLASS =
  'block min-h-11 w-full rounded-md border border-rule-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-soft/70 transition-colors duration-150 focus:border-accent aria-[invalid=true]:border-danger';

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
  className?: string;
}

export function Field({ label, hint, error, children, className = '' }: FieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint;
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-sm font-semibold text-ink">{label}</label>
      {children({ id, describedBy: message ? messageId : undefined, invalid: Boolean(error) })}
      {message && (
        <p id={messageId} className={`text-sm ${error ? 'text-danger' : 'text-ink-soft'}`}>{message}</p>
      )}
    </div>
  );
}

type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  wrapperClassName?: string;
};

export function TextInput({ label, value, onChange, hint, error, wrapperClassName, ...rest }: TextInputProps) {
  return (
    <Field label={label} hint={hint} error={error} className={wrapperClassName}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id} dir="rtl" lang="ar" className={INPUT_CLASS} value={value}
          aria-describedby={describedBy} aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value)} {...rest}
        />
      )}
    </Field>
  );
}

/** حقل يعرض أي رقم مكتوب بالعربي فوراً، مع الحفاظ على موضع المؤشر. */
export function DigitInput({ label, value, onChange, hint, error, wrapperClassName, ...rest }: TextInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const caretRef = useRef<number | null>(null);
  const display = toArabicDigits(value);

  useLayoutEffect(() => {
    if (caretRef.current !== null && inputRef.current && document.activeElement === inputRef.current) {
      inputRef.current.setSelectionRange(caretRef.current, caretRef.current);
    }
    caretRef.current = null;
  }, [display]);

  return (
    <Field label={label} hint={hint} error={error} className={wrapperClassName}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id} ref={inputRef} dir="rtl" lang="ar" inputMode="decimal" autoComplete="off"
          className={INPUT_CLASS} value={display} aria-describedby={describedBy} aria-invalid={invalid}
          onChange={(e) => {
            caretRef.current = e.target.selectionStart;
            onChange(e.target.value);
          }}
          {...rest}
        />
      )}
    </Field>
  );
}

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> & {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  children: ReactNode;
};

export function Select({ label, value, onChange, hint, children, ...rest }: SelectProps) {
  return (
    <Field label={label} hint={hint}>
      {({ id, describedBy }) => (
        <select
          id={id} dir="rtl" className={INPUT_CLASS} value={value}
          aria-describedby={describedBy} onChange={(e) => onChange(e.target.value)} {...rest}
        >
          {children}
        </select>
      )}
    </Field>
  );
}

export function Notice({ tone, children }: { tone: 'danger' | 'warn' | 'info'; children: ReactNode }) {
  const toneClass = {
    danger: 'bg-danger-tint text-danger',
    warn: 'bg-warn-tint text-warn',
    info: 'bg-accent-tint text-accent-strong',
  }[tone];
  return <div role={tone === 'danger' ? 'alert' : 'status'} className={`rounded-md px-3 py-2 text-sm font-semibold ${toneClass}`}>{children}</div>;
}

export function PageHeader({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-ink-soft">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </header>
  );
}

/** حالة فاضية تشرح للمحاسب الخطوة الجاية. */
export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="max-w-lg py-12">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-2 text-ink-soft">{children}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
