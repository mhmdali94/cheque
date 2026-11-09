import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { buildPageSetup } from '@/core/geometry';
import { formatDate, todayIso } from '@/core/date';
import { toArabicDigits } from '@/core/digits';
import type { Cheque } from '@/core/types';
import { marginWarnings } from '@/core/warnings';
import { getAccountantName, logAudit } from '@/db/repos';
import { db } from '@/db/schema';
import { createChequePdf, toPdfBlob } from '@/print/chequePdf';
import { deliverPdf, savePdf } from '@/print/deliver';
import { createReviewPdf } from '@/print/reviewCopy';
import { trialKey, usePrinter } from '@/state/usePrinter';
import { Button, Notice } from '@/ui/controls';
import { createSimilarCheque } from './similar';
import type { ChequeView } from './useChequeView';

const CHECKLIST = [
  'الشيك في الدرج الأمامي، والموجّهين مقفولين عليه',
  'داخل بالطول، والحافة الشمال (ناحية الشعار) هي اللي تدخل الأول',
  'الوش اللي هيتطبع عليه لفوق',
];

type Stage = 'ready' | 'sent' | 'done';

export function PrintPanel({ cheque, view }: { cheque: Cheque; view: ChequeView }) {
  const navigate = useNavigate();
  const printer = usePrinter();
  const { profile, calibration, renderer } = printer;
  const { template, model, shaper, numberLabel } = view;
  const [pdf, setPdf] = useState<Blob | null>(null);
  const [failed, setFailed] = useState(false);
  const [checks, setChecks] = useState<boolean[]>([]);
  const [numberMatches, setNumberMatches] = useState(false);
  const [confirmBlocking, setConfirmBlocking] = useState(false);
  const [skipTrial, setSkipTrial] = useState(false);
  const [confirmReprint, setConfirmReprint] = useState(false);
  const [stage, setStage] = useState<Stage>('ready');
  const [blockedPopup, setBlockedPopup] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);

  const setup = useMemo(
    () => (template && profile ? buildPageSetup(template.lengthMm, template.widthMm, profile, calibration) : null),
    [template, profile, calibration],
  );

  // الملف يتجهز مسبقاً: نافذة المشاركة لازم تتفتح مباشرة من ضغطة الزر.
  useEffect(() => {
    if (!model || !setup || !shaper) return;
    let alive = true;
    setFailed(false);
    createChequePdf({ model, setup, shaper, renderer }).then(
      (bytes) => { if (alive) setPdf(toPdfBlob(bytes)); },
      () => { if (alive) setFailed(true); },
    );
    return () => { alive = false; };
  }, [model, setup, shaper, renderer]);

  const trialDone = useLiveQuery(
    () => (profile && template ? db.settings.get(trialKey(profile.id, template.id)).then((e) => Boolean(e?.value)) : false),
    [profile?.id, template?.id],
  );

  const sendRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && sendRef.current) {
        event.preventDefault();
        sendRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!template || !model || !profile || !setup) return null;

  const warnings = [...view.warnings, ...marginWarnings(model, setup.matrix, profile.leadingMarginMm)];
  const blocking = warnings.filter((w) => w.blocking);
  const isReprint = cheque.status === 'printed';
  const isClosed = cheque.status === 'cancelled' || cheque.status === 'damaged';
  const filename = `شيك ${toArabicDigits(numberLabel ?? '')}.pdf`;

  const allChecked = CHECKLIST.every((_, i) => checks[i]) && numberMatches;
  const canPrint = Boolean(pdf) && allChecked
    && (blocking.length === 0 || confirmBlocking)
    && (Boolean(trialDone) || skipTrial)
    && (!isReprint || confirmReprint);

  const send = async () => {
    if (!pdf) return;
    const result = await deliverPdf(pdf, filename);
    if (result === 'cancelled') return;
    setBlockedPopup(result === 'blocked');
    setStage('sent');
    if (isReprint) await logAudit(cheque, 'reprint');
  };

  sendRef.current = canPrint && stage === 'ready' && !isClosed ? () => void send() : null;

  const printedOk = async () => {
    if (isReprint) {
      await db.cheques.update(cheque.id, { printCount: cheque.printCount + 1, updatedAt: Date.now() });
    } else {
      await db.cheques.update(cheque.id, {
        status: 'printed', printedAt: Date.now(), printCount: 1, templateSnapshot: template, updatedAt: Date.now(),
      });
      await logAudit(cheque, 'print');
    }
    setStage('done');
  };

  const printedDamaged = async () => {
    await db.cheques.update(cheque.id, { status: 'damaged', templateSnapshot: template, updatedAt: Date.now() });
    await logAudit(cheque, 'damage');
    const copy = await createSimilarCheque(cheque);
    navigate(`/cheque/${copy.id}`);
  };

  const printReview = async () => {
    if (!shaper) return;
    setReviewBusy(true);
    try {
      const photo = template.imageId ? (await db.images.get(template.imageId))?.data : undefined;
      const bytes = await createReviewPdf(
        [{ template, model, chequeNumber: numberLabel, photo }],
        { accountant: await getAccountantName(), preparedDate: formatDate(todayIso()) }, shaper,
      );
      await deliverPdf(toPdfBlob(bytes), `مراجعة ${toArabicDigits(numberLabel ?? '')}.pdf`);
    } finally {
      setReviewBusy(false);
    }
  };

  if (stage === 'done') {
    return (
      <section className="mt-6 flex flex-col gap-3">
        <Notice tone="info">اتحفظ الشيك كمطبوع.</Notice>
        <Link className="font-semibold text-accent underline" to="/cheque">اكتب شيك جديد</Link>
      </section>
    );
  }

  if (stage === 'sent') {
    return (
      <section aria-label="نتيجة الطباعة" className="mt-6 flex flex-col gap-3">
        {blockedPopup && <Notice tone="warn">المتصفح منع فتح الملف، فاتنزّل على جهازك. افتحه واطبعه.</Notice>}
        <h2 className="text-lg font-bold">هل طُبع الشيك سليم؟</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => void printedOk()}>تمام، طلع سليم</Button>
          <Button variant="danger" onClick={() => void printedDamaged()}>تالف، هات الرقم التالي</Button>
          {pdf && <Button variant="ghost" onClick={() => savePdf(pdf, filename)}>تنزيل الملف</Button>}
          <Button variant="ghost" onClick={() => setStage('ready')}>رجوع</Button>
        </div>
      </section>
    );
  }

  const checkbox = 'size-5 shrink-0 accent-[var(--accent)]';
  return (
    <section aria-label="الطباعة" className="mt-6 flex flex-col gap-4">
      {warnings.filter((w) => !view.warnings.includes(w)).map((w) => <Notice key={w.id} tone="warn">{w.message}</Notice>)}
      {failed && <Notice tone="danger">تعذر تجهيز ملف الطباعة. أعد فتح الصفحة.</Notice>}

      {!isClosed && (
        <>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 font-bold">قبل الطباعة</legend>
            {CHECKLIST.map((item, index) => (
              <label key={item} className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" className={checkbox} checked={Boolean(checks[index])} onChange={(e) => setChecks((list) => { const next = [...list]; next[index] = e.target.checked; return next; })} />
                {item}
              </label>
            ))}
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
              <input type="checkbox" className={checkbox} checked={numberMatches} onChange={(e) => setNumberMatches(e.target.checked)} />
              رقم الشيك على الورقة هو {toArabicDigits(numberLabel ?? '')}
            </label>
          </fieldset>

          {blocking.length > 0 && (
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-danger">
              <input type="checkbox" className={checkbox} checked={confirmBlocking} onChange={(e) => setConfirmBlocking(e.target.checked)} />
              عارف بالتحذيرات الحمرا وعايز أطبع برضه
            </label>
          )}

          {trialDone === false && (
            <div className="flex flex-col gap-2">
              <Notice tone="warn">
                لسه ما جربتش القالب ده على ورقة مقصوصة.{' '}
                <Link to="/printer" className="underline">جرّب الأول</Link> قبل ما تستخدم شيك حقيقي.
              </Notice>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" className={checkbox} checked={skipTrial} onChange={(e) => setSkipTrial(e.target.checked)} />
                أتحمل المسؤولية وأطبع من غير تجربة
              </label>
            </div>
          )}

          {isReprint && (
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-danger">
              <input type="checkbox" className={checkbox} checked={confirmReprint} onChange={(e) => setConfirmReprint(e.target.checked)} />
              الشيك ده اتطبع قبل كده، وعايز أعيد طباعته (هتتسجل في السجل)
            </label>
          )}

          <Button variant="primary" className="w-full lg:w-auto" disabled={!canPrint} onClick={() => void send()}>
            {isReprint ? 'إعادة طباعة على الشيك' : 'اطبع على الشيك'}
          </Button>
        </>
      )}

      <Button disabled={reviewBusy} className="w-full lg:w-auto" onClick={() => void printReview()}>
        {reviewBusy ? 'جاري التجهيز...' : 'طباعة للمراجعة على ورق عادي'}
      </Button>
    </section>
  );
}
