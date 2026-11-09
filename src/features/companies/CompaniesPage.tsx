import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatNumber, parseAmount, toArabicDigits, toLatinDigits, type AmountProtection } from '@/core/digits';
import { CUSTOM_PRESET_ID, resolveTafqeetOptions, TAFQEET_PRESETS, tafqeet } from '@/core/tafqeet';
import type { Company } from '@/core/types';
import { remainingInBook } from '@/db/repos';
import { db } from '@/db/schema';
import { useCurrentCompany } from '@/state/useAppData';
import { Button, DigitInput, Notice, PageHeader, Select, TextInput } from '@/ui/controls';
import { ColorPicker } from './ColorPicker';
import { addAccount, addBook, addCompany, COMPANY_COLORS, formatChequeNumber, parseBookRange } from './data';

const PROTECTION_OPTIONS: { value: AmountProtection; label: string }[] = [
  { value: 'slash', label: 'زي الشيكات: الرقم وبعده شرطة' },
  { value: 'hash', label: 'بين علامتي #' },
  { value: 'star', label: 'بين علامات نجمة' },
];

const LOW_BOOK_THRESHOLD = 5;

function NewCompanyForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(COMPANY_COLORS[1].value);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) { setError('اكتب اسم الشركة'); return; }
    await addCompany(name, color);
    onDone();
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="mb-8 flex max-w-lg flex-col gap-4 rounded-md border border-rule bg-surface p-4" noValidate>
      <TextInput label="اسم الشركة" value={name} onChange={setName} error={error} autoFocus />
      <ColorPicker value={color} onChange={setColor} />
      <div className="flex gap-2">
        <Button type="submit" variant="primary">حفظ الشركة</Button>
        <Button variant="ghost" onClick={onDone}>إلغاء</Button>
      </div>
    </form>
  );
}

function CompanyPreferences({ company }: { company: Company }) {
  const update = (patch: Partial<Company>) => db.companies.update(company.id, { ...patch, updatedAt: Date.now() });
  const [limit, setLimit] = useState(company.amountLimit ? String(company.amountLimit) : '');
  const sample = tafqeet(148500, resolveTafqeetOptions(company.tafqeetPresetId, company.customPattern || '{المبلغ}'));

  return (
    <section aria-label="صيغ الكتابة" className="grid gap-4 md:grid-cols-2">
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
    </section>
  );
}

function AccountsAndBooks({ company }: { company: Company }) {
  const accounts = useLiveQuery(() => db.accounts.where('companyId').equals(company.id).toArray(), [company.id]);
  const books = useLiveQuery(async () => {
    const list = await db.books.where('companyId').equals(company.id).toArray();
    return Promise.all(list.map(async (book) => ({ book, remaining: await remainingInBook(book) })));
  }, [company.id]);
  const templates = useLiveQuery(() => db.templates.toArray(), []);

  const [bankName, setBankName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [label, setLabel] = useState('');
  const [accountNumber, setAccountNumber] = useState('');

  const [bookAccountId, setBookAccountId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rangeError, setRangeError] = useState('');

  const banks = [...new Set(templates?.map((t) => t.bankName))];
  const bank = bankName || banks[0] || '';
  const models = templates?.filter((t) => t.bankName === bank) ?? [];
  const model = models.find((t) => t.id === templateId) ?? models[0];
  const selectedAccount = accounts?.find((a) => a.id === bookAccountId) ?? accounts?.[0];
  const accountById = new Map(accounts?.map((a) => [a.id, a]));

  const submitAccount = async (event: FormEvent) => {
    event.preventDefault();
    if (!model) return;
    await addAccount({ companyId: company.id, bankName: bank, label: label.trim() || model.modelName, accountNumber: toLatinDigits(accountNumber).trim(), templateId: model.id });
    setLabel('');
    setAccountNumber('');
  };

  const submitBook = async (event: FormEvent) => {
    event.preventDefault();
    const range = parseBookRange(from, to, toLatinDigits);
    if (!range.ok) { setRangeError(range.error); return; }
    if (!selectedAccount) return;
    setRangeError('');
    await addBook({ companyId: company.id, accountId: selectedAccount.id, fromNumber: range.from, toNumber: range.to, numberWidth: range.width });
    setFrom('');
    setTo('');
  };

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section>
        <h3 className="font-bold">الحسابات البنكية</h3>
        <ul className="mt-2 divide-y divide-rule">
          {accounts?.map((a) => (
            <li key={a.id} className="py-2">
              <span className="font-semibold">{a.bankName}</span>
              <span className="text-ink-soft"> ، {a.label}{a.accountNumber && ` ، حساب ${toArabicDigits(a.accountNumber)}`}</span>
            </li>
          ))}
        </ul>
        <form onSubmit={(e) => void submitAccount(e)} className="mt-3 flex flex-col gap-3">
          <Select label="البنك" value={bank} onChange={(v) => { setBankName(v); setTemplateId(''); }}>
            {banks.map((b) => <option key={b}>{b}</option>)}
          </Select>
          <Select label="نموذج الشيك" value={model?.id ?? ''} onChange={setTemplateId}>
            {models.map((t) => <option key={t.id} value={t.id}>{t.modelName}</option>)}
          </Select>
          <TextInput label="اسم مميز للحساب" value={label} onChange={setLabel} hint="اختياري." />
          <DigitInput label="رقم الحساب" value={accountNumber} onChange={setAccountNumber} hint="اختياري، للتأكيد قبل الطباعة." />
          <Button type="submit" className="self-start">إضافة حساب</Button>
        </form>
      </section>

      <section>
        <h3 className="font-bold">دفاتر الشيكات</h3>
        <ul className="mt-2 divide-y divide-rule">
          {books?.map(({ book, remaining }) => {
            const account = accountById.get(book.accountId);
            return (
              <li key={book.id} className="py-2">
                <p className="font-semibold tabular-nums">
                  من {toArabicDigits(formatChequeNumber(book.fromNumber, book.numberWidth))} إلى {toArabicDigits(formatChequeNumber(book.toNumber, book.numberWidth))}
                </p>
                <p className={remaining <= LOW_BOOK_THRESHOLD ? 'text-sm font-semibold text-warn' : 'text-sm text-ink-soft'}>
                  {account && `${account.bankName} ، `}متبقي {formatNumber(remaining)} {remaining <= LOW_BOOK_THRESHOLD && 'والدفتر قرب يخلص'}
                </p>
              </li>
            );
          })}
        </ul>
        {accounts?.length ? (
          <form onSubmit={(e) => void submitBook(e)} className="mt-3 flex flex-col gap-3" noValidate>
            <Select label="الحساب" value={selectedAccount?.id ?? ''} onChange={setBookAccountId}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.bankName} ، {a.label}</option>)}
            </Select>
            <div className="grid grid-cols-2 gap-3">
              <DigitInput label="أول رقم" value={from} onChange={setFrom} error={rangeError} />
              <DigitInput label="آخر رقم" value={to} onChange={setTo} />
            </div>
            <Button type="submit" className="self-start">إضافة دفتر</Button>
          </form>
        ) : (
          <Notice tone="info">أضف حساب بنكي الأول، وبعدها سجّل الدفتر عليه.</Notice>
        )}
      </section>
    </div>
  );
}

export function CompaniesPage() {
  const { company } = useCurrentCompany();
  const [adding, setAdding] = useState(false);

  return (
    <>
      <PageHeader title="الشركات والدفاتر">
        <Button onClick={() => setAdding(true)}>شركة جديدة</Button>
      </PageHeader>
      {adding && <NewCompanyForm onDone={() => setAdding(false)} />}
      {company && (
        <div key={company.id} className="flex flex-col gap-8">
          <h2 className="text-xl font-bold">{company.name}</h2>
          <CompanyPreferences company={company} />
          <AccountsAndBooks company={company} />
        </div>
      )}
    </>
  );
}
