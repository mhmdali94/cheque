import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatNumber, parseAmount, type AmountProtection } from '@/core/digits';
import { CUSTOM_PRESET_ID, resolveTafqeetOptions, TAFQEET_PRESETS, tafqeet } from '@/core/tafqeet';
import type { Company } from '@/core/types';
import { db } from '@/db/schema';
import { useCurrentCompany } from '@/state/useAppData';
import { Button, DigitInput, PageHeader, Select, TextInput } from '@/ui/controls';
import { ColorPicker } from './ColorPicker';
import { addCompany, COMPANY_COLORS } from './data';

const PROTECTION_OPTIONS: { value: AmountProtection; label: string }[] = [
  { value: 'slash', label: 'زي الشيكات: الرقم وبعده شرطة' },
  { value: 'hash', label: 'بين علامتي #' },
  { value: 'star', label: 'بين علامات نجمة' },
];

function NewCompanyForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(COMPANY_COLORS[1].value);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) { setError('اكتب اسم الشركة'); return; }
    await addCompany(name, color);
    onCreated();
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="mb-8 flex max-w-lg flex-col gap-4 rounded-md border border-rule bg-surface p-4" noValidate>
      <TextInput label="اسم الشركة" value={name} onChange={setName} error={error} autoFocus hint="الشركة صاحبة دفتر الشيكات. بعد الحفظ هنضيف حسابها البنكي." />
      <ColorPicker value={color} onChange={setColor} />
      <div className="flex gap-2">
        <Button type="submit" variant="primary">حفظ الشركة</Button>
        <Button variant="ghost" onClick={onCancel}>إلغاء</Button>
      </div>
    </form>
  );
}

function CompanyPreferences({ company }: { company: Company }) {
  const update = (patch: Partial<Company>) => db.companies.update(company.id, { ...patch, updatedAt: Date.now() });
  const [limit, setLimit] = useState(company.amountLimit ? String(company.amountLimit) : '');
  const sample = tafqeet(148500, resolveTafqeetOptions(company.tafqeetPresetId, company.customPattern || '{المبلغ}'));

  return (
    <div className="flex flex-col gap-4 pt-3">
      <Select label="صيغة التفقيط" value={company.tafqeetPresetId} onChange={(v) => void update({ tafqeetPresetId: v })} hint={`مثال: ${sample}`}>
        {TAFQEET_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        <option value={CUSTOM_PRESET_ID}>صيغة مخصصة</option>
      </Select>
      {company.tafqeetPresetId === CUSTOM_PRESET_ID && (
        <TextInput
          label="الصيغة المخصصة" value={company.customPattern ?? ''} onChange={(v) => void update({ customPattern: v })}
          hint="استخدم {المبلغ} للعدد و{العملة} لكلمة الجنيه حسب العدد."
        />
      )}
      <Select label="حماية المبلغ بالأرقام" value={company.amountProtection} onChange={(v) => void update({ amountProtection: v as AmountProtection })}>
        {PROTECTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
      <DigitInput
        label="نبّهني لو المبلغ أكبر من" value={limit} hint="اختياري."
        onChange={(v) => {
          setLimit(v);
          const parsed = parseAmount(v);
          void update({ amountLimit: parsed.ok ? parsed.value : undefined });
        }}
      />
    </div>
  );
}

function CompanyCard({ company, isCurrent, onOpen }: { company: Company; isCurrent: boolean; onOpen: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(company.name);
  const [color, setColor] = useState(company.color);
  const [error, setError] = useState('');

  const counts = useLiveQuery(async () => {
    const [accounts, books, cheques] = await Promise.all([
      db.accounts.where('companyId').equals(company.id).count(),
      db.books.where('companyId').equals(company.id).count(),
      db.cheques.where('companyId').equals(company.id).count(),
    ]);
    return { accounts, books, cheques };
  }, [company.id]);

  const startEdit = () => {
    setName(company.name);
    setColor(company.color);
    setError('');
    setEditing(true);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) { setError('اكتب اسم الشركة'); return; }
    await db.companies.update(company.id, { name: name.trim(), color, updatedAt: Date.now() });
    setEditing(false);
  };

  return (
    <article className="flex flex-col overflow-hidden rounded-lg border border-rule bg-surface">
      <div aria-hidden className="h-2" style={{ background: company.color }} />
      <div className="flex grow flex-col gap-3 p-4">
        {editing ? (
          <form onSubmit={(e) => void save(e)} className="flex flex-col gap-4" noValidate>
            <TextInput label="اسم الشركة" value={name} onChange={setName} error={error} autoFocus hint="الاسم الجديد بيظهر في كل الشاشات." />
            <ColorPicker value={color} onChange={setColor} />
            <div className="flex gap-2">
              <Button type="submit" variant="primary">حفظ التعديل</Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>إلغاء</Button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-bold">{company.name}</h2>
              {isCurrent && <span className="shrink-0 rounded-full bg-accent-tint px-2 py-0.5 text-xs font-bold text-accent-strong">الحالية</span>}
            </div>
            <dl className="flex gap-6 text-sm">
              {[['حسابات', counts?.accounts], ['دفاتر', counts?.books], ['شيكات', counts?.cheques]].map(([label, value]) => (
                <div key={label as string} className="flex items-baseline gap-1">
                  <dd className="text-lg font-bold tabular-nums">{formatNumber((value as number) ?? 0)}</dd>
                  <dt className="text-ink-soft">{label}</dt>
                </div>
              ))}
            </dl>
            <div className="mt-auto flex flex-wrap gap-2">
              <Button variant="primary" aria-label={`افتح حسابات ${company.name}`} onClick={onOpen}>افتح الحسابات</Button>
              <Button onClick={startEdit}>تعديل</Button>
            </div>
          </>
        )}
        <details className="group border-t border-rule pt-1">
          <summary className="flex min-h-11 items-center justify-between gap-2 text-sm font-semibold">
            صيغ الكتابة (التفقيط وحماية المبلغ)
            <span aria-hidden className="text-lg text-ink-soft transition-transform duration-150 group-open:rotate-45">+</span>
          </summary>
          <CompanyPreferences company={company} />
        </details>
      </div>
    </article>
  );
}

/** أول خطوة في المسار: شركة، ثم حساباتها، ثم دفاترها، ثم الشيكات. */
export function CompaniesPage() {
  const { companies, company: current, selectCompany } = useCurrentCompany();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);

  const open = async (id: string) => {
    await selectCompany(id);
    navigate('/accounts');
  };

  return (
    <>
      <PageHeader title="الشركات" description="كل شركة ليها حساباتها ودفاترها وسجلها، منفصلين عن باقي الشركات.">
        <Button variant="primary" onClick={() => setAdding(true)}>شركة جديدة</Button>
      </PageHeader>

      {adding && <NewCompanyForm onCancel={() => setAdding(false)} onCreated={() => navigate('/accounts/new')} />}

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,21rem),1fr))]">
        {companies?.map((company) => (
          <CompanyCard key={company.id} company={company} isCurrent={company.id === current?.id} onOpen={() => void open(company.id)} />
        ))}
      </div>
    </>
  );
}
