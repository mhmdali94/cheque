import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatNumber, toArabicDigits, toLatinDigits } from '@/core/digits';
import type { BankAccount, ChequeBook } from '@/core/types';
import { remainingInBook } from '@/db/repos';
import { db } from '@/db/schema';
import { useCurrentCompany } from '@/state/useAppData';
import { Button, DigitInput, EmptyState, PageHeader } from '@/ui/controls';
import { addBook, formatChequeNumber, parseBookRange } from './data';

const LOW_BOOK_THRESHOLD = 5;

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

export function AccountsPage() {
  const { company } = useCurrentCompany();

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
      </PageHeader>

      {company && (
        <div className="mb-4 flex flex-wrap items-baseline gap-3">
          <h2 className="text-lg font-bold">{company.name}</h2>
          <Link to="/companies" className="text-sm font-semibold text-accent underline">تغيير الشركة</Link>
        </div>
      )}

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
    </>
  );
}
