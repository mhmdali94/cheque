import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatDate } from '@/core/date';
import { formatProtectedAmount, toArabicDigits } from '@/core/digits';
import { amountInWords } from '@/core/layout';
import { newId } from '@/db/repos';
import { db } from '@/db/schema';
import { ChequePreview } from '@/features/preview/ChequePreview';
import { Button, Notice, PageHeader } from '@/ui/controls';
import { Magnifier } from '@/ui/Magnifier';
import { PrintPanel } from './PrintPanel';
import { chequeValues, useChequeView } from './useChequeView';

function speak(text: string) {
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ar-EG';
  window.speechSynthesis.speak(utterance);
}

export function ReviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const cheque = useLiveQuery(() => db.cheques.get(id ?? ''), [id]);
  const view = useChequeView(cheque ?? null);
  const [lensOn, setLensOn] = useState(false);

  useEffect(() => {
    if (cheque === null) navigate('/cheque', { replace: true });
  }, [cheque, navigate]);

  // المستفيد يدخل قائمة الإكمال التلقائي أول ما الشيك يوصل للمراجعة.
  const payee = cheque?.payee.trim();
  const companyId = cheque?.companyId;
  useEffect(() => {
    if (!payee || !companyId) return;
    void db.transaction('rw', db.payees, async () => {
      const existing = await db.payees.where({ companyId, name: payee }).first();
      if (existing) await db.payees.update(existing.id, { useCount: existing.useCount + 1, updatedAt: Date.now() });
      else await db.payees.add({ id: newId(), companyId, name: payee, useCount: 1, updatedAt: Date.now() });
    });
  }, [payee, companyId]);

  if (!cheque || !view.template || !view.company) return null;

  const canSpeak = 'speechSynthesis' in window;

  const words = amountInWords(chequeValues(cheque, view.company));
  const digits = cheque.amount !== null ? formatProtectedAmount(cheque.amount, view.company.amountProtection, view.template.amountDigits.signSide, cheque.piasters ?? 0) : '';

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="مراجعة الشيك">
        <Link className="flex min-h-11 items-center font-semibold text-accent underline" to={`/cheque/${cheque.id}`}>رجوع للتعديل</Link>
      </PageHeader>

      <Notice tone="warn">
        الشيك ده من دفتر شركة: {view.company.name} ، حساب: {view.account?.bankName} {view.account?.label}
        {view.account?.accountNumber && ` ${toArabicDigits(view.account.accountNumber)}`}
        {view.numberLabel && ` ، رقم الشيك ${toArabicDigits(view.numberLabel)}`}
      </Notice>

      <div className="my-6">
        <Magnifier enabled={lensOn}>
          <ChequePreview template={view.template} model={view.model} shaper={view.shaper} chequeNumber={view.numberLabel} label="الشيك مكبّر للمراجعة" />
        </Magnifier>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="ghost" className="max-lg:hidden" aria-pressed={lensOn} onClick={() => setLensOn(!lensOn)}>{lensOn ? 'إخفاء العدسة' : 'عدسة مكبّرة'}</Button>
          {canSpeak && <Button variant="ghost" onClick={() => speak(words)}>اسمع المبلغ</Button>}
        </div>
      </div>

      <dl className="grid gap-x-8 gap-y-4 border-y border-rule py-4 md:grid-cols-[auto_1fr]">
        <dt className="text-sm font-semibold text-ink-soft">بالأرقام</dt>
        <dd dir="ltr" className="text-end text-2xl font-bold tabular-nums md:text-start" style={{ direction: 'ltr', textAlign: 'right' }}>{digits}</dd>
        <dt className="text-sm font-semibold text-ink-soft">بالحروف</dt>
        <dd className="text-lg font-semibold">{words}</dd>
        <dt className="text-sm font-semibold text-ink-soft">المستفيد</dt>
        <dd>{cheque.payee}</dd>
        <dt className="text-sm font-semibold text-ink-soft">التاريخ</dt>
        <dd dir="ltr" style={{ textAlign: 'right' }}>{formatDate(cheque.date)}</dd>
      </dl>

      {view.warnings.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {view.warnings.map((w) => <li key={w.id}><Notice tone={w.blocking ? 'danger' : 'warn'}>{w.message}</Notice></li>)}
        </ul>
      )}

      <PrintPanel cheque={cheque} view={view} />
    </div>
  );
}
