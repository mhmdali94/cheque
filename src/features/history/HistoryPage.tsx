import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { createChequesWorkbook, STATUS_LABEL, XLSX_MIME } from '@/backup/excel';
import type { QrItem } from '@/backup/qr';
import { formatDate, formatDateTime, todayIso } from '@/core/date';
import { formatNumber, toArabicDigits, toLatinDigits } from '@/core/digits';
import type { AuditAction, Cheque, ChequeStatus } from '@/core/types';
import { getAccountantName, logAudit } from '@/db/repos';
import { db } from '@/db/schema';
import { QrPanel } from '@/features/backup/QrPanel';
import { buildReviewItem } from '@/features/compose/reviewItems';
import { createSimilarCheque } from '@/features/compose/similar';
import { deliverPdf } from '@/print/deliver';
import { toPdfBlob } from '@/print/chequePdf';
import { createReviewPdf } from '@/print/reviewCopy';
import { useCurrentCompany, useShaper } from '@/state/useAppData';
import { Button, EmptyState, Notice, PageHeader, Select, TextInput } from '@/ui/controls';
import { DatePicker } from '@/ui/DatePicker';
import { downloadBlob } from '@/ui/download';

type SortKey = 'date' | 'amount' | 'number' | 'updatedAt';

const AUDIT_LABEL: Record<AuditAction, string> = {
  create: 'إنشاء', update: 'تعديل', print: 'طباعة', reprint: 'إعادة طباعة', cancel: 'إلغاء', damage: 'تالف',
};

const STATUS_CLASS: Record<ChequeStatus, string> = {
  draft: 'text-ink-soft', printed: 'text-accent', cancelled: 'text-ink-soft line-through', damaged: 'text-danger',
};

export function HistoryPage() {
  const { company, companies } = useCurrentCompany();
  const navigate = useNavigate();
  const { shaper } = useShaper();

  const [query, setQuery] = useState('');
  const [allCompanies, setAllCompanies] = useState(false);
  const [status, setStatus] = useState('');
  const [bank, setBank] = useState('');
  const [bookId, setBookId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<SortKey>('updatedAt');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [qr, setQr] = useState<{ item: QrItem; label: string } | null>(null);
  const [auditFor, setAuditFor] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = (event.target as HTMLElement).closest('input, select, textarea');
      if (event.key === '/' && !typing) {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('[data-history-search]')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const cheques = useLiveQuery(() => db.cheques.toArray(), []);
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const books = useLiveQuery(() => db.books.toArray(), []);
  const audit = useLiveQuery(
    () => (auditFor ? db.auditLog.where('chequeId').equals(auditFor).sortBy('at') : []),
    [auditFor],
  );

  const accountById = useMemo(() => new Map(accounts?.map((a) => [a.id, a])), [accounts]);
  const bookById = useMemo(() => new Map(books?.map((b) => [b.id, b])), [books]);
  const companyById = useMemo(() => new Map(companies?.map((c) => [c.id, c])), [companies]);

  const rows = useMemo(() => {
    const term = toLatinDigits(query.trim());
    const filtered = (cheques ?? []).filter((c) => {
      if (!allCompanies && c.companyId !== company?.id) return false;
      if (status && c.status !== status) return false;
      if (bank && accountById.get(c.accountId)?.bankName !== bank) return false;
      if (bookId && c.bookId !== bookId) return false;
      if (from && c.date < from) return false;
      if (to && c.date > to) return false;
      if (term) {
        const haystack = `${toLatinDigits(c.payee)} ${c.number ?? ''} ${c.amount ?? ''}`;
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
    const value = (c: Cheque) => (sort === 'date' ? c.date : sort === 'amount' ? c.amount ?? 0 : sort === 'number' ? c.number ?? 0 : c.updatedAt);
    return filtered.sort((a, b) => (value(a) < value(b) ? 1 : value(a) > value(b) ? -1 : 0));
  }, [cheques, allCompanies, company?.id, status, bank, bookId, from, to, query, sort, accountById]);

  const totals = useMemo(() => {
    const byCompany = new Map<string, { count: number; total: number }>();
    for (const c of rows) {
      if (c.status !== 'printed') continue;
      const entry = byCompany.get(c.companyId) ?? { count: 0, total: 0 };
      entry.count += 1;
      entry.total += c.amount ?? 0;
      byCompany.set(c.companyId, entry);
    }
    return [...byCompany];
  }, [rows]);

  const banks = [...new Set(accounts?.map((a) => a.bankName))];
  const visibleBooks = books?.filter((b) => allCompanies || b.companyId === company?.id);
  const numberText = (c: Cheque) => {
    const book = bookById.get(c.bookId);
    return c.number === null ? 'بدون رقم' : toArabicDigits(String(c.number).padStart(book?.numberWidth ?? 0, '0'));
  };

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const exportExcel = async () => {
    const buffer = await createChequesWorkbook(rows, { companies: companyById, accounts: accountById, books: bookById });
    downloadBlob(new Blob([buffer], { type: XLSX_MIME }), `سجل الشيكات ${toArabicDigits(todayIso())}.xlsx`);
  };

  const printSelected = async () => {
    if (!shaper) return;
    setError('');
    const chosen = rows.filter((c) => selected.has(c.id));
    const items = (await Promise.all(chosen.map((c) => buildReviewItem(c, shaper)))).filter((i) => i !== null);
    if (items.length === 0) { setError('تعذر تجهيز الشيكات المختارة.'); return; }
    const bytes = await createReviewPdf(items, { accountant: await getAccountantName(), preparedDate: formatDate(todayIso()) }, shaper);
    await deliverPdf(toPdfBlob(bytes), 'مراجعة شيكات.pdf');
  };

  const cancel = async (cheque: Cheque) => {
    await db.cheques.update(cheque.id, { status: 'cancelled', updatedAt: Date.now() });
    await logAudit(cheque, 'cancel');
  };

  const similar = async (cheque: Cheque) => {
    const copy = await createSimilarCheque(cheque);
    navigate(`/cheque/${copy.id}`);
  };

  const checkbox = 'size-5 accent-[var(--accent)]';

  return (
    <>
      <PageHeader title="سجل الشيكات">
        <Button onClick={() => void exportExcel()} disabled={rows.length === 0}>تصدير إكسل</Button>
        <Button onClick={() => void printSelected()} disabled={selected.size === 0}>طباعة المختار للمراجعة ({toArabicDigits(selected.size)})</Button>
      </PageHeader>

      {error && <div className="mb-4"><Notice tone="danger">{error}</Notice></div>}
      {qr && <QrPanel item={qr.item} label={qr.label} onClose={() => setQr(null)} />}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TextInput data-history-search label="بحث" value={query} onChange={setQuery} placeholder="مستفيد، رقم، أو مبلغ" />
        <Select label="الحالة" value={status} onChange={setStatus}>
          <option value="">كل الحالات</option>
          {(Object.keys(STATUS_LABEL) as ChequeStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </Select>
        <Select label="البنك" value={bank} onChange={setBank}>
          <option value="">كل البنوك</option>
          {banks.map((b) => <option key={b}>{b}</option>)}
        </Select>
        <Select label="الدفتر" value={bookId} onChange={setBookId}>
          <option value="">كل الدفاتر</option>
          {visibleBooks?.map((b) => <option key={b.id} value={b.id}>من {toArabicDigits(String(b.fromNumber).padStart(b.numberWidth, '0'))}</option>)}
        </Select>
        <DatePicker label="من تاريخ" value={from} onChange={setFrom} />
        <DatePicker label="إلى تاريخ" value={to} onChange={setTo} />
        <Select label="ترتيب حسب" value={sort} onChange={(v) => setSort(v as SortKey)}>
          <option value="updatedAt">آخر تعديل</option><option value="date">تاريخ الشيك</option>
          <option value="amount">المبلغ</option><option value="number">رقم الشيك</option>
        </Select>
        <div className="flex items-end gap-3">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className={checkbox} checked={allCompanies} onChange={(e) => setAllCompanies(e.target.checked)} /> كل الشركات
          </label>
          {(from || to) && <Button variant="ghost" onClick={() => { setFrom(''); setTo(''); }}>مسح التاريخ</Button>}
        </div>
      </div>

      {totals.length > 0 && (
        <dl className="mb-4 flex flex-wrap gap-x-8 gap-y-1 border-y border-rule py-3 text-sm">
          {totals.map(([id, t]) => (
            <div key={id} className="flex gap-2">
              <dt className="text-ink-soft">{companyById.get(id)?.name}: مطبوع {formatNumber(t.count)}</dt>
              <dd className="font-bold tabular-nums">{formatNumber(t.total)} جنيه</dd>
            </div>
          ))}
        </dl>
      )}

      {cheques && rows.length === 0 && (
        <EmptyState title="مفيش شيكات مطابقة" action={<Link className="font-semibold text-accent underline" to="/cheque">اكتب شيك</Link>}>
          غيّر الفلاتر، أو ابدأ بكتابة أول شيك للشركة دي.
        </EmptyState>
      )}

      <ul className="divide-y divide-rule">
        {rows.map((c) => (
          <li key={c.id} className="py-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <input type="checkbox" className={checkbox} checked={selected.has(c.id)} onChange={() => toggle(c.id)} aria-label={`اختيار شيك ${numberText(c)}`} />
              <Link to={`/cheque/${c.id}`} className="min-w-48 flex-1 font-semibold hover:text-accent">
                {c.payee || 'بدون مستفيد'}
                <span className="block text-sm font-normal text-ink-soft">
                  {allCompanies && `${companyById.get(c.companyId)?.name} ، `}رقم {numberText(c)} ، <span dir="ltr">{formatDate(c.date)}</span> ، {accountById.get(c.accountId)?.bankName}
                </span>
              </Link>
              <p className="font-bold tabular-nums">{c.amount !== null ? `${formatNumber(c.amount)} جنيه` : ''}</p>
              <p className={`text-sm font-semibold ${STATUS_CLASS[c.status]}`}>{STATUS_LABEL[c.status]}</p>
              <div className="flex flex-wrap">
                <Button variant="ghost" onClick={() => void similar(c)}>شيك مشابه</Button>
                <Button variant="ghost" onClick={() => setAuditFor(auditFor === c.id ? null : c.id)}>السجل</Button>
                <Button variant="ghost" onClick={() => setQr({ item: { kind: 'cheque', cheque: c }, label: `نقل شيك ${numberText(c)}` })}>رمز</Button>
                {c.status !== 'cancelled' && <Button variant="ghost" onClick={() => void cancel(c)}>إلغاء</Button>}
              </div>
            </div>
            {auditFor === c.id && (
              <ol className="mt-2 flex flex-col gap-1 rounded-md bg-sunken p-3 text-sm">
                {audit?.map((a) => (
                  <li key={a.id}>{AUDIT_LABEL[a.action]} ، {a.accountant} ، {formatDateTime(a.at)}{a.detail && ` ، ${a.detail}`}</li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
