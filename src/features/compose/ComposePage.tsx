import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { todayIso } from '@/core/date';
import { parseAmount, toArabicDigits, toLatinDigits } from '@/core/digits';
import { amountInWords } from '@/core/layout';
import { ACCURACY_LABEL } from '@/core/templates';
import type { Cheque, CrossingKind } from '@/core/types';
import { logAudit, newId, nextChequeNumber } from '@/db/repos';
import { db } from '@/db/schema';
import { ChequePreview } from '@/features/preview/ChequePreview';
import { formatChequeNumber } from '@/features/companies/data';
import { useCurrentCompany } from '@/state/useAppData';
import { Combobox } from '@/ui/Combobox';
import { Button, DigitInput, EmptyState, Notice, Select, TextInput } from '@/ui/controls';
import { DatePicker } from '@/ui/DatePicker';
import { createSimilarCheque } from './similar';
import { chequeValues, useChequeView } from './useChequeView';

const SAVE_DELAY_MS = 250;

const CROSSING_OPTIONS: { value: CrossingKind; label: string }[] = [
  { value: 'none', label: 'بدون عبارة' },
  { value: 'firstBeneficiary', label: 'يصرف للمستفيد الأول' },
  { value: 'special', label: 'تسطير خاص (اسم بنك)' },
  { value: 'notNegotiable', label: 'غير قابل للتداول' },
  { value: 'free', label: 'عبارة حرة' },
];

export function ComposePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { company } = useCurrentCompany();
  const [cheque, setCheque] = useState<Cheque | null>(null);

  const chequeRef = useRef<Cheque | null>(null);
  const persistedRef = useRef(false);
  const updateLoggedRef = useRef(false);
  const saveTimer = useRef<number | undefined>(undefined);

  const books = useLiveQuery(() => (company ? db.books.where('companyId').equals(company.id).toArray() : []), [company?.id]);
  const accounts = useLiveQuery(() => (company ? db.accounts.where('companyId').equals(company.id).toArray() : []), [company?.id]);
  const payees = useLiveQuery(() => (company ? db.payees.where('companyId').equals(company.id).toArray() : []), [company?.id]);
  const signatories = useLiveQuery(() => (company ? db.signatories.where('companyId').equals(company.id).toArray() : []), [company?.id]);

  const view = useChequeView(cheque);
  const [extrasOpen, setExtrasOpen] = useState(false);
  // الإضافات تتفتح لوحدها لو الشيك المفتوح فيه حاجة منها.
  useEffect(() => {
    const current = chequeRef.current;
    if (current) setExtrasOpen(Boolean(current.memo || current.crossing.kind !== 'none' || current.crossing.drawLines || current.printStub));
  }, [cheque?.id]);
  const locked = cheque !== null && cheque.status !== 'draft';

  const replaceCheque = useCallback((next: Cheque | null, persisted: boolean) => {
    chequeRef.current = next;
    persistedRef.current = persisted;
    updateLoggedRef.current = false;
    setCheque(next);
  }, []);

  const flush = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    const current = chequeRef.current;
    if (!current || current.status !== 'draft') return;
    await db.cheques.put(current);
  }, []);

  // تحميل شيك موجود أو تجهيز شيك جديد
  useEffect(() => {
    let alive = true;
    (async () => {
      if (id) {
        if (chequeRef.current?.id === id) return;
        const stored = await db.cheques.get(id);
        if (!alive) return;
        if (stored) replaceCheque(stored, true);
        else navigate('/cheque', { replace: true });
        return;
      }
      if (!company || !books || !accounts) return;
      const current = chequeRef.current;
      if (current && !persistedRef.current && current.companyId === company.id) return;

      const book = books[0];
      const account = accounts.find((a) => a.id === book?.accountId);
      if (!book || !account) {
        replaceCheque(null, false);
        return;
      }
      const number = await nextChequeNumber(book);
      if (!alive) return;
      const now = Date.now();
      replaceCheque({
        id: newId(), companyId: company.id, accountId: account.id, bookId: book.id,
        templateId: account.templateId, number, status: 'draft', payee: '', amount: null, amountInput: '',
        date: todayIso(), memo: '', signatoryName: '', crossing: { kind: 'none', text: '', drawLines: false },
        printStub: false, printCount: 0, createdAt: now, updatedAt: now,
      }, false);
    })();
    return () => { alive = false; };
  }, [id, company, books, accounts, navigate, replaceCheque]);

  // حفظ أخير لو الصفحة اتقفلت أو الموبايل راح لتطبيق تاني
  useEffect(() => {
    const onHide = () => { if (saveTimer.current !== undefined) void flush(); };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
      onHide();
    };
  }, [flush]);

  const shortcuts = useRef<{ review?: () => void; similar?: () => void }>({});
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key === 'Enter' && shortcuts.current.review) { event.preventDefault(); shortcuts.current.review(); }
      if (event.key.toLowerCase() === 'd' && shortcuts.current.similar) { event.preventDefault(); shortcuts.current.similar(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const update = (patch: Partial<Cheque>) => {
    const current = chequeRef.current;
    if (!current || current.status !== 'draft') return;
    const next = { ...current, ...patch, updatedAt: Date.now() };
    chequeRef.current = next;
    setCheque(next);

    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS);

    if (!persistedRef.current) {
      persistedRef.current = true;
      updateLoggedRef.current = true;
      void db.cheques.put(next).then(() => logAudit(next, 'create'));
      navigate(`/cheque/${next.id}`, { replace: true });
    } else if (!updateLoggedRef.current) {
      updateLoggedRef.current = true;
      void logAudit(next, 'update');
    }
  };

  const changeBook = async (bookId: string) => {
    const book = books?.find((b) => b.id === bookId);
    const account = accounts?.find((a) => a.id === book?.accountId);
    if (!book || !account || !cheque) return;
    update({ bookId, accountId: account.id, templateId: account.templateId, number: await nextChequeNumber(book, cheque.id) });
  };

  const saveSignatory = async () => {
    const name = cheque?.signatoryName.trim();
    if (!cheque || !name) return;
    const existing = await db.signatories.where({ companyId: cheque.companyId, name }).first();
    if (!existing) await db.signatories.add({ id: newId(), companyId: cheque.companyId, name, updatedAt: Date.now() });
  };

  const review = async () => {
    await flush();
    if (cheque) navigate(`/cheque/${cheque.id}/review`);
  };

  if (books && books.length === 0 && !id) {
    return (
      <EmptyState title="مفيش دفتر شيكات للشركة دي" action={<Link className="font-semibold text-accent underline" to="/accounts">سجّل دفتر</Link>}>
        كل شيك لازم يتكتب على دفتر، عشان رقمه يتراجع على نطاق الدفتر.
      </EmptyState>
    );
  }
  if (!cheque || !books) return null;

  const parsedAmount = cheque.amountInput ? parseAmount(cheque.amountInput) : null;
  const words = company && cheque.amount !== null ? amountInWords(chequeValues(cheque, view.company ?? company)) : '';
  const signatoryNames = signatories?.map((s) => s.name) ?? [];
  const canSaveSignatory = cheque.signatoryName.trim() !== '' && !signatoryNames.includes(cheque.signatoryName.trim());
  const needsText = cheque.crossing.kind === 'special' || cheque.crossing.kind === 'free';
  const today = todayIso();
  const datePassed = !locked && cheque.date < today;
  const canReview = cheque.amount !== null && cheque.payee.trim() !== '' && Boolean(cheque.bookId) && !datePassed;

  shortcuts.current = {
    review: canReview && !locked ? () => void review() : undefined,
    similar: persistedRef.current ? () => void flush().then(() => createSimilarCheque(cheque)).then((copy) => navigate(`/cheque/${copy.id}`)) : undefined,
  };

  const sectionTitle = 'mb-3 flex items-center gap-2 font-bold';
  const sectionNumber = 'flex size-7 items-center justify-center rounded-full bg-accent-tint text-sm font-bold text-accent-strong';

  const form = (
    <fieldset disabled={locked} className="flex flex-col gap-8 disabled:opacity-75">
      <legend className="sr-only">بيانات الشيك</legend>

      <section className="flex flex-col gap-4">
        <h2 className={sectionTitle}><span className={sectionNumber}>١</span>لمين وبكام؟</h2>
        <Combobox
          label="المستفيد" value={cheque.payee} onChange={(payee) => update({ payee })}
          hint="اسم الشخص أو الشركة اللي هيصرف الشيك، زي ما هيتكتب عليه."
          options={[...(payees ?? [])].sort((a, b) => b.useCount - a.useCount).map((p) => p.name)}
        />
        <DigitInput
          label="المبلغ بالجنيه" value={cheque.amountInput}
          hint="بالأرقام وبالجنيه الصحيح، من غير قروش. التفقيط بيتكتب لوحده."
          error={parsedAmount && !parsedAmount.ok ? parsedAmount.error : undefined}
          onChange={(amountInput) => {
            const parsed = parseAmount(amountInput);
            update({ amountInput, amount: parsed.ok ? parsed.value : null });
          }}
        />
        {words && <p aria-live="polite" className="-mt-2 rounded-md bg-accent-tint px-3 py-2 text-sm font-semibold text-accent-strong">{words}</p>}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className={sectionTitle}><span className={sectionNumber}>٢</span>الشيك والتوقيع</h2>
        <Select label="الدفتر" value={cheque.bookId} onChange={(v) => void changeBook(v)} hint="دفتر الشيكات اللي الورقة دي منه.">
          {books.map((b) => {
            const account = accounts?.find((a) => a.id === b.accountId);
            return (
              <option key={b.id} value={b.id}>
                {account?.bankName} ، من {toArabicDigits(formatChequeNumber(b.fromNumber, b.numberWidth))} لـ {toArabicDigits(formatChequeNumber(b.toNumber, b.numberWidth))}
              </option>
            );
          })}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <DatePicker label="التاريخ" value={cheque.date} onChange={(date) => update({ date })} minDate={locked ? undefined : today} hint="النهارده أو أي يوم جاي. لو بعد النهارده يبقى مؤجل." />
          <DigitInput
            label="رقم الشيك"
            hint="المطبوع على الورقة جنب كلمة شيك."
            value={cheque.number === null ? '' : view.book ? formatChequeNumber(cheque.number, view.book.numberWidth) : String(cheque.number)}
            onChange={(input) => {
              const digits = toLatinDigits(input).replace(/\D/g, '');
              update({ number: digits ? Number(digits) : null });
            }}
          />
        </div>
        {datePassed && <Notice tone="danger">تاريخ الشيك ده فات. اختار النهارده أو يوم جاي.</Notice>}
        <div>
          <Combobox label="اسم المفوض بالتوقيع" value={cheque.signatoryName} onChange={(signatoryName) => update({ signatoryName })} options={signatoryNames} hint="الشخص اللي هيوقّع الشيك. اسمه بيتطبع فوق مكان التوقيع، ولو فاضي مش هيتطبع." />
          {canSaveSignatory && (
            <Button variant="ghost" className="mt-1" onClick={() => void saveSignatory()}>احفظ الاسم ده</Button>
          )}
        </div>
      </section>

      <details className="group" open={extrasOpen} onToggle={(e) => setExtrasOpen(e.currentTarget.open)}>
        <summary className={`${sectionTitle} min-h-11 mb-0`}><span className={sectionNumber}>٣</span>إضافات اختيارية: البيان والتسطير<span aria-hidden className="ms-auto text-lg text-ink-soft transition-transform duration-150 group-open:rotate-45">+</span></summary>
        <div className="mt-3 flex flex-col gap-4">
          <TextInput label="البيان" value={cheque.memo} onChange={(memo) => update({ memo })} hint="سبب الدفع، للرجوع إليه في السجل. مثلاً: إيجار شهر مارس. عادةً مش بيتطبع على الشيك." />
          <Select
            label="عبارة التسطير" value={cheque.crossing.kind}
            hint="بتتكتب بين خطي التسطير المطبوعين على الشيك. لو مش متأكد سيبها بدون عبارة."
            onChange={(kind) => update({ crossing: { ...cheque.crossing, kind: kind as CrossingKind } })}
          >
            {CROSSING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          {needsText && (
            <TextInput
              label={cheque.crossing.kind === 'special' ? 'اسم البنك' : 'العبارة'} value={cheque.crossing.text}
              hint={cheque.crossing.kind === 'special' ? 'البنك الوحيد اللي ينفع الشيك يتصرف عن طريقه.' : 'مثلاً: لا يصرف إلا من خلال العميل.'}
              onChange={(text) => update({ crossing: { ...cheque.crossing, text } })}
            />
          )}
          {view.template?.stub.enabled && (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={cheque.printStub} onChange={(e) => update({ printStub: e.target.checked })} />
              اطبع بيانات مختصرة على الكعب
            </label>
          )}
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox" className="size-5 accent-[var(--accent)]" checked={cheque.crossing.drawLines}
              onChange={(e) => update({ crossing: { ...cheque.crossing, drawLines: e.target.checked } })}
            />
            ارسم خطين تسطير إضافيين (للشيكات اللي مفيهاش تسطير مطبوع)
          </label>
        </div>
      </details>
    </fieldset>
  );

  const reviewButton = locked ? null : (
    <Button variant="primary" className="w-full" disabled={!canReview} onClick={() => void review()}>راجع واطبع</Button>
  );

  return (
    <div className="pb-24 lg:pb-0">
      <div className="grid gap-8 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div>
          {locked && (
            <div className="mb-4 flex flex-col gap-3">
              <Notice tone="info">الشيك ده اتطبع أو اتلغى، ومش قابل للتعديل.</Notice>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={() => void createSimilarCheque(cheque).then((copy) => navigate(`/cheque/${copy.id}`))}>شيك مشابه</Button>
                <Link className="flex min-h-11 items-center px-2 font-semibold text-accent underline" to={`/cheque/${cheque.id}/review`}>مراجعة وإعادة طباعة</Link>
              </div>
            </div>
          )}
          {form}
          <div className="mt-6 hidden lg:block">{reviewButton}</div>
        </div>

        <section aria-label="معاينة الشيك" className="min-w-0 lg:sticky lg:top-32 lg:self-start">
          {view.template ? (
            <ChequePreview template={view.template} model={view.model} shaper={view.shaper} chequeNumber={view.numberLabel} label="معاينة الشيك" />
          ) : (
            <div className="aspect-[174/84] w-full animate-pulse rounded-sm bg-sunken" />
          )}
          {view.template && view.template.accuracy !== 'adjusted' && (
            <p className="mt-3 text-sm font-semibold text-warn">
              {ACCURACY_LABEL[view.template.accuracy]}.{' '}
              <Link className="underline" to={`/templates/${view.template.id}/measure`}>قِس شيكك</Link>
            </p>
          )}
          {view.shaperError && <div className="mt-3"><Notice tone="danger">تعذر تحميل خط الشيك. أعد فتح الصفحة.</Notice></div>}
          {view.warnings.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2">
              {view.warnings.map((w) => <li key={w.id}><Notice tone={w.blocking ? 'danger' : 'warn'}>{w.message}</Notice></li>)}
            </ul>
          )}
        </section>
      </div>

      {!locked && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
          {reviewButton}
        </div>
      )}
    </div>
  );
}
