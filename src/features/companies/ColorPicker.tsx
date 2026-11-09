import { COMPANY_COLORS } from './data';

export function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold">لون الشركة</legend>
      <p className="text-sm text-ink-soft">بيظهر فوق كل الشاشات عشان ما تكتبش لشركة على دفتر شركة تانية.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {COMPANY_COLORS.map((color) => (
          <label key={color.value} className="relative flex size-11 cursor-pointer items-center justify-center">
            <input
              type="radio" name="company-color" className="peer sr-only" checked={value === color.value}
              onChange={() => onChange(color.value)} aria-label={color.name}
            />
            <span
              aria-hidden className="size-8 rounded-full outline-offset-2 peer-checked:outline-2 peer-checked:outline-ink peer-focus-visible:outline-2 peer-focus-visible:outline-accent"
              style={{ background: color.value }}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
