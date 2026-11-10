import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatNumber, parseAmount, toArabicDigits, toLatinDigits, type AmountProtection } from '@/core/digits';
import { CUSTOM_PRESET_ID, resolveTafqeetOptions, TAFQEET_PRESETS, tafqeet } from '@/core/tafqeet';
import type { BankAccount, ChequeBook, Company } from '@/core/types';
import { remainingInBook } from '@/db/repos';
import { db } from '@/db/schema';
import { useCurrentCompany } from '@/state/useAppData';
import { Button, DigitInput, EmptyState, PageHeader, Select, TextInput } from '@/ui/controls';
import { ColorPicker } from './ColorPicker';
import { addBook, addCompany, COMPANY_COLORS, formatChequeNumber, parseBookRange } from './data';

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
      <TextInput label="اسم الشركة" value={name} onChange={setName} error={error} autoFocus hint="الشركة صاحبة دفتر الشيكات." />
      <ColorPicker value={color} onChange={setColor} />
      <div className="flex gap-2">
        <Button type="submit" variant="primary">حفظ الشركة</Button>
        <Button variant="ghost" onClick={onDone}>إلغاء</Button>
      </div>
    </form>
  );
}

function BookRow({ book, remaining }: { book: ChequeBook; remaining: number }) {
  const total = book.toNumber - book.fromNumber + 1;
  const low = remaining <= LOW_BOOK_THRESHOLD;
  const used = Math.round(((total - remaining) / total) * 100);
  return (
    <li className="py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold tabular-nums">
          من {toArabicDigits(formatChequeNumber(book.fromNumber, book.numberWidth))} إلى {toArabicDigits(formatChequeNumber(book.toNumber, book.numberWidth))}
        </p>
        <p className={`shrink-0 text-sm ${low ? 'font-semibold text-warn' : 'text-ink-soft'}`}>
          {low ? 'قرب يخلص: ' : 'متبقي '}{formatNumber(remaining)} من {formatNumber(total)}
        </p>
      </div>
      <div aria-hidden className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken">
        <div className={`h-full rounded-full ${low ? 'bg-warn' : 'bg-accent'}`} style={{ width: `${used}%` }} />
      </div>
    </li>
  );
}

function AddBookForm({ account, onDone }: { account: BankAccount; onDone: () => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const range = parseBookRange(from, to, toLatinDigits);
    if (!range.ok) { setError(range.error); return; }
    await addBook({ companyId: account.companyId, accountId: account.id, fromNumber: range.from, toNumber: range.to, numberWidth: range.width });
    onDone();
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-3 flex flex-col gap-3 border-t border-rule pt-3" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <DigitInput label="أول رقم" value={from} onChange={setFrom} error={error} hint="المطبوع على أول ورقة." autoFocus />
        <DigitInput label="آخر رقم" value={to} onChange={setTo} hint="المطبوع على آخر ورقة." />
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="primary">حفظ الدفتر</Button>
        <Button variant="ghost" onClick={onDone}>إلغاء</Button>
      </div>
    </form>
  );
}

function AccountCard({ account, books }: { account: BankAccount; books: { book: ChequeBook; remaining: number }[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <article className="flex flex-col rounded-lg border border-rule bg-surface">
      <header className="rounded-t-lg bg-sunken px-4 py-3">
        <h3 className="font-bold">{account.bankName}</h3>
        <p className="text-sm text-ink-soft">
          {account.label}{account.accountNumber && ` ، حساب ${toArabicDigits(account.accountNumber)}`}
        </p>
      </header>
      <div className="flex grow flex-col px-4 pb-4">
        {books.length > 0 ? (
          <ul className="divide-y divide-rule">{books.map(({ book, remaining }) => <BookRow key={book.id} book={book} remaining={remaining} />)}</ul>
        ) : (
          <p className="py-4 text-sm text-ink-soft">لسه مفيش دفتر على الحساب ده. سجّل دفتر عشان تقدر تكتب شيك.</p>
        )}
        {adding ? (
          <AddBookForm account={account} onDone={() => setAdding(false)} />
        ) : (
          <div className="mt-auto flex flex-wrap gap-2 pt-3">
            <Button onClick={() => setAdding(true)}>إضافة دفتر</Button>
            {books.length > 0 && (
              <Link to="/cheque" className="flex min-h-11 items-center px-2 text-sm font-semibold text-accent underline">اكتب شيك</Link>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function CompanyPreferences({ company }: { company: Company }) {
  const update = (patch: Partial<Company>) => db.companies.update(company.id, { ...patch, updatedAt: Date.now() });
  const [limit, setLimit] = useState(company.amountLimit ? String(company.amountLimit) : '');
  const sample = tafqeet(148500, resolveTafqeetOptions(company.tafqeetPresetId, company.customPattern || '{المبلغ}'));

  return (
    <div className="grid gap-4 pt-3 md:grid-cols-2">
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

export function AccountsPage() {
  const { company } = useCurrentCompany();
  const [addingCompany, setAddingCompany] = useState(false);

  const accounts = useLiveQuery(() => (company ? db.accounts.where('companyId').equals(company.id).toArray() : []), [company?.id]);
  const books = useLiveQuery(async () => {
    if (!company) return [];
    const list = await db.books.where('companyId').equals(company.id).toArray();
    return Promise.all(list.map(async (book) => ({ book, remaining: await remainingInBook(book) })));
  }, [company?.id]);

  return (
    <>
      <PageHeader title="الحسابات البنكية" description="كل حساب ودفاتر الشيكات اللي عليه، وكام ورقة باقية في كل دفتر.">
        <Link to="/accounts/new" className="flex min-h-11 items-center rounded-md bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-strong">إضافة حساب جديد</Link>
        <Button onClick={() => setAddingCompany(true)}>شركة جديدة</Button>
      </PageHeader>

      {addingCompany && <NewCompanyForm onDone={() => setAddingCompany(false)} />}

      {company && <h2 className="mb-4 text-lg font-bold">{company.name}</h2>}

      {accounts?.length === 0 && (
        <EmptyState title="لسه مفيش حسابات للشركة دي" action={<Link className="font-semibold text-accent underline" to="/accounts/new">أضف أول حساب</Link>}>
          كل شيك بيتكتب على دفتر تابع لحساب بنكي، فدي أول خطوة.
        </EmptyState>
      )}

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,21rem),1fr))]">
        {accounts?.map((account) => (
          <AccountCard key={account.id} account={account} books={books?.filter((b) => b.book.accountId === account.id) ?? []} />
        ))}
      </div>

      {company && (
        <details className="group mt-8 border-t border-rule pt-3">
          <summary className="flex min-h-11 items-center font-bold">صيغ الكتابة للشركة دي (التفقيط وحماية المبلغ)<span aria-hidden className="ms-auto text-lg text-ink-soft transition-transform duration-150 group-open:rotate-45">+</span></summary>
          <CompanyPreferences key={company.id} company={company} />
        </details>
      )}
    </>
  );
}
