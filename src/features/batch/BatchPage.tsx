import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { createBatchTemplate, parseBatchWorkbook, XLSX_MIME, type BatchRow } from '@/backup/excel';
import { buildPageSetup } from '@/core/geometry';
import { formatDate, todayIso } from '@/core/date';
import { formatNumber, parseAmount, toArabicDigits, toLatinDigits } from '@/core/digits';
import { layoutCheque } from '@/core/layout';
import type { Cheque } from '@/core/types';
import { logAudit, newId, usedNumbers } from '@/db/repos';
import { db } from '@/db/schema';
import { formatChequeNumber } from '@/features/companies/data';
import { chequeValues } from '@/features/compose/useChequeView';
import { createChequePdf, toPdfBlob } from '@/print/chequePdf';
import { deliverPdf } from '@/print/deliver';
import { useCurrentCompany, useShaper } from '@/state/useAppData';
import { trialKey, usePrinter } from '@/state/usePrinter';
import { Button, EmptyState, Notice, PageHeader, Select } from '@/ui/controls';
import { downloadBlob } from '@/ui/download';

/** أرقام متتالية فاضية في الدفتر تبدأ من رقم معين، أو null لو الدفتر مش كفاية. */
function allocateNumbers(start: number, count: number, end: number, used: Set<number>): number[] | null {
  const numbers: number[] = [];
  for (let n = start; n <= end && numbers.length < count; n++) {
    if (!used.has(n)) numbers.push(n);
  }
  return numbers.length === count ? numbers : null;
}

export function BatchPage() {
  const { company } = useCurrentCompany();
  const { shaper } = useShaper();
  const { profile, calibration, renderer } = usePrinter();
  const books = useLiveQuery(() => (company ? db.books.where('companyId').equals(company.id).toArray() : []), [company?.id]);
  const accounts = useLiveQuery(() => (company ? db.accounts.where('companyId').equals(company.id).toArray() : []), [company?.id]);

  const [rows, setRows] = useState<BatchRow[]>([]);
  const [error, setError] = useState('');
  const [bookId, setBookId] = useState('');
  const [queue, setQueue] = useState<Cheque[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<'edit' | 'insert' | 'confirm' | 'done'>('edit');
  const [pdf, setPdf] = useState<Blob | null>(null);
  const [skipTrial, setSkipTrial] = useState(false);

  const book = books?.find((b) => b.id === bookId) ?? books?.[0];
  const account = accounts?.find((a) => a.id === book?.accountId);
  const template = useLiveQuery(() => (account ? db.templates.get(account.templateId) : undefined), [account?.templateId]);
  const trialDone = useLiveQuery(
    () => (profile && template ? db.settings.get(trialKey(profile.id, template.id)).then((e) => Boolean(e?.value)) : false),
    [profile?.id, template?.id],
  );

  const validRows = rows.filter((r) => r.errors.length === 0);
  const current = queue[index];
  const setup = useMemo(
    () => (template && profile ? buildPageSetup(template.lengthMm, template.widthMm, profile, calibration) : null),
    [template, profile, calibration],
  );

  // الملف جاهز قبل الضغط، عشان نافذة المشاركة تتفتح على الموبايل.
  useEffect(() => {
    if (phase !== 'insert' || !current || !template || !company || !shaper || !setup) return;
    let alive = true;
    setPdf(null);
    const model = layoutCheque(template, chequeValues(current, company), shaper);
    void createChequePdf({ model, setup, shaper, renderer }).then((bytes) => { if (alive) setPdf(toPdfBlob(bytes)); });
    return () => { alive = false; };
  }, [phase, current, template, company, shaper, setup, renderer]);

  const downloadTemplate = async () => {
    downloadBlob(new Blob([await createBatchTemplate()], { type: XLSX_MIME }), 'قالب دفعة الشيكات.xlsx');
  };

  const pickFile = async (file?: File) => {
    if (!file) return;
    setError('');
    try {
      setRows(await parseBatchWorkbook(await file.arrayBuffer(), todayIso(), { toLatin: toLatinDigits, parseAmount }));
    } catch (e) {
      setRows([]);
      setError((e as Error).message || 'تعذر قراءة الملف.');
    }
  };

  const start = async () => {
    if (!company || !book || !account) return;
    setError('');
    const used = await usedNumbers(book.id);
    const numbers = allocateNumbers(book.fromNumber, validRows.length, book.toNumber, used);
    if (!numbers) { setError('الدفتر مفيهوش أرقام فاضية كفاية للدفعة دي.'); return; }

    const now = Date.now();
    const drafts: Cheque[] = validRows.map((row, i) => ({
      id: newId(), companyId: company.id, accountId: account.id, bookId: book.id, templateId: account.templateId, number: numbers[i],
      status: 'draft', payee: row.payee, amount: row.amount, amountInput: String(row.amount), date: row.date, memo: row.memo,
      signatoryName: '', crossing: { kind: 'none', text: '', drawLines: false }, printStub: false, printCount: 0, createdAt: now, updatedAt: now,
    }));
    await db.cheques.bulkAdd(drafts);
    await Promise.all(drafts.map((d) => logAudit(d, 'create', 'دفعة من إكسل')));
    setQueue(drafts);
    setIndex(0);
    setPhase('insert');
  };

  const printCurrent = async () => {
    if (!pdf || !current) return;
    await deliverPdf(pdf, `شيك ${toArabicDigits(current.number ?? '')}.pdf`);
    setPhase('confirm');
  };

  const advance = () => {
    if (index + 1 >= queue.length) setPhase('done');
    else { setIndex(index + 1); setPhase('insert'); }
  };

  const markOk = async () => {
    await db.cheques.update(current.id, { status: 'printed', printedAt: Date.now(), printCount: 1, templateSnapshot: template, updatedAt: Date.now() });
    await logAudit(current, 'print', 'دفعة من إكسل');
    advance();
  };

  /** الورقة التالفة راحت، فنفس الشيك وكل اللي بعده ياخدوا الأرقام اللي بعدها بالترتيب. */
  const markDamaged = async () => {
    if (!book || current.number === null) return;
    setError('');
    const remaining = queue.slice(index);
    const used = await usedNumbers(book.id);
    remaining.forEach((c) => { if (c.number !== null) used.delete(c.number); });
    used.add(current.number);

    const numbers = allocateNumbers(current.number + 1, remaining.length, book.toNumber, used);
    if (!numbers) { setError('الدفتر خلص، ومفيش رقم للشيكات الباقية.'); return; }

    const now = Date.now();
    const retry: Cheque = { ...current, id: newId(), number: numbers[0], createdAt: now, updatedAt: now };
    const shifted = remaining.slice(1).map((c, i) => ({ ...c, number: numbers[i + 1], updatedAt: now }));

    await db.transaction('rw', db.cheques, async () => {
      await db.cheques.update(current.id, { status: 'damaged', templateSnapshot: template, updatedAt: now });
      await db.cheques.bulkPut([retry, ...shifted]);
    });
    await logAudit(current, 'damage', 'دفعة من إكسل');
    await logAudit(retry, 'create', 'بدل تالف');
    setQueue([...queue.slice(0, index + 1), retry, ...shifted]);
    setIndex(index + 1);
    setPhase('insert');
  };

  const numberLabel = (cheque: Cheque) => toArabicDigits(formatChequeNumber(cheque.number ?? 0, book?.numberWidth ?? 0));

  if (books && books.length === 0) {
    return (
      <EmptyState title="مفيش دفتر شيكات للشركة دي" action={<Link className="font-semibold text-accent underline" to="/companies">سجّل دفتر</Link>}>
        الدفعة بتتكتب على دفتر، عشان كل شيك ياخد رقمه بالترتيب.
      </EmptyState>
    );
  }

  if (phase === 'done') {
    return (
      <div className="max-w-xl">
        <PageHeader title="طباعة دفعة" />
        <Notice tone="info">خلصت الدفعة.</Notice>
        <Link className="mt-4 inline-block font-semibold text-accent underline" to="/history">افتح السجل</Link>
      </div>
    );
  }

  if ((phase === 'insert' || phase === 'confirm') && current) {
    return (
      <div className="flex max-w-xl flex-col gap-4">
        <PageHeader title="طباعة دفعة" />
        <p className="text-sm font-semibold text-ink-soft">شيك {formatNumber(index + 1)} من {formatNumber(queue.length)}</p>
        <dl className="border-y border-rule py-3">
          <dt className="sr-only">المستفيد</dt><dd className="text-lg font-bold">{current.payee}</dd>
          <dt className="sr-only">المبلغ</dt><dd className="text-2xl font-bold tabular-nums">{formatNumber(current.amount ?? 0)} جنيه</dd>
          <dt className="sr-only">التاريخ</dt><dd dir="ltr" style={{ textAlign: 'right' }}>{formatDate(current.date)}</dd>
        </dl>
        {error && <Notice tone="danger">{error}</Notice>}
        {phase === 'insert' ? (
          <>
            <Notice tone="warn">أدخل الشيك التالي رقم {numberLabel(current)} ثم اضغط متابعة.</Notice>
            <Button variant="primary" disabled={!pdf} onClick={() => void printCurrent()}>متابعة</Button>
          </>
        ) : (
          <>
            <h2 className="text-lg font-bold">هل طُبع الشيك سليم؟</h2>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => void markOk()}>تمام، طلع سليم</Button>
              <Button variant="danger" onClick={() => void markDamaged()}>تالف، هات الرقم التالي</Button>
            </div>
          </>
        )}
      </div>
    );
  }

  const canStart = validRows.length > 0 && Boolean(book) && (Boolean(trialDone) || skipTrial);

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageHeader title="طباعة دفعة من إكسل">
        <Button onClick={() => void downloadTemplate()}>نزّل قالب إكسل</Button>
      </PageHeader>
      <p className="text-ink-soft">املا القالب بالمستفيد والمبلغ والتاريخ والبيان، وارفعه هنا. هتراجع كل الصفوف قبل أي طباعة.</p>
      <label className="inline-flex min-h-11 w-fit cursor-pointer items-center rounded-md border border-rule-strong bg-surface px-4 text-sm font-semibold hover:bg-sunken focus-within:outline-2 focus-within:outline-accent">
        ارفع ملف الشيكات
        <input type="file" accept=".xlsx" className="sr-only" aria-label="ملف إكسل" onChange={(e) => void pickFile(e.target.files?.[0])} />
      </label>
      {error && <Notice tone="danger">{error}</Notice>}

      {rows.length > 0 && (
        <>
          <ul className="divide-y divide-rule">
            {rows.map((row) => (
              <li key={row.rowNumber} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2">
                <span className="text-sm text-ink-soft">صف {toArabicDigits(row.rowNumber)}</span>
                <span className="min-w-40 flex-1 font-semibold">{row.payee || 'بدون مستفيد'}</span>
                <span dir="ltr" className="text-sm">{formatDate(row.date)}</span>
                <span className="font-bold tabular-nums">{row.amount !== null ? formatNumber(row.amount) : ''}</span>
                {row.errors.length > 0 && <span className="w-full text-sm font-semibold text-danger">{row.errors.join(' ، ')}: الصف ده مش هيتطبع</span>}
              </li>
            ))}
          </ul>
          <Select label="الدفتر" value={book?.id ?? ''} onChange={setBookId}>
            {books?.map((b) => <option key={b.id} value={b.id}>من {toArabicDigits(formatChequeNumber(b.fromNumber, b.numberWidth))} لـ {toArabicDigits(formatChequeNumber(b.toNumber, b.numberWidth))}</option>)}
          </Select>
          {trialDone === false && (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="size-5 shrink-0 accent-[var(--accent)]" checked={skipTrial} onChange={(e) => setSkipTrial(e.target.checked)} />
              لسه ما جربتش القالب ده، وأتحمل المسؤولية وأطبع من غير تجربة
            </label>
          )}
          <Button variant="primary" className="self-start" disabled={!canStart} onClick={() => void start()}>
            ابدأ طباعة {formatNumber(validRows.length)} شيك
          </Button>
        </>
      )}
    </div>
  );
}
