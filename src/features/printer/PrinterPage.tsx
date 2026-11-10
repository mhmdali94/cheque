import { useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { correctedScale } from '@/core/geometry';
import { layoutCheque, type ChequeValues } from '@/core/layout';
import { toArabicDigits, toLatinDigits } from '@/core/digits';
import { todayIso } from '@/core/date';
import type { PageAlign, PageMode, PrinterProfile, Rotation } from '@/core/types';
import { newId, setSetting } from '@/db/repos';
import { db } from '@/db/schema';
import { orderedTemplates } from '@/features/companies/data';
import { buildPageSetup } from '@/core/geometry';
import { createChequePdf, toPdfBlob, type PdfRenderer } from '@/print/chequePdf';
import { deliverPdf } from '@/print/deliver';
import { createCalibrationPdf, createDirectionPdf, RULER_LENGTH_MM } from '@/print/testPages';
import { useShaper } from '@/state/useAppData';
import { trialKey, usePrinter } from '@/state/usePrinter';
import { Button, DigitInput, Notice, PageHeader, Select, TextInput } from '@/ui/controls';
import { OutcomeIllustration, ShiftIllustration, TrayIllustration, type OutcomeId, type ShiftId } from './illustrations';

const STEP_MM = 0.5;

/** أسماء قوائم الطابعة كما تظهر على شاشتها، وهي الاستثناء الوحيد من العربية. */
const Menu = ({ children }: { children: ReactNode }) => (
  <bdi dir="ltr" data-allow-latin className="rounded bg-sunken px-1.5 py-0.5 text-sm font-semibold">{children}</bdi>
);

const OUTCOMES: { id: OutcomeId; label: string }[] = [
  { id: 'correct', label: 'طلع سليم' },
  { id: 'flipped', label: 'مقلوب' },
  { id: 'mirrored', label: 'معكوس زي المراية' },
  { id: 'backFace', label: 'اتطبع على الوش التاني' },
];

const SHIFTS: { id: ShiftId; label: string; dx: number; dy: number }[] = [
  { id: 'down', label: 'نازل لتحت', dx: 0, dy: -1 },
  { id: 'up', label: 'طالع لفوق', dx: 0, dy: 1 },
  { id: 'right', label: 'مزحوح يمين', dx: -1, dy: 0 },
  { id: 'left', label: 'مزحوح شمال', dx: 1, dy: 0 },
];

const SAMPLE: ChequeValues = {
  payee: 'تجربة طباعة', amount: 148500, date: todayIso(), memo: '', signatoryName: '',
  crossing: { kind: 'none', text: '', drawLines: false }, printStub: false, tafqeetPresetId: 'accounting', amountProtection: 'slash',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-rule pt-6">
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      <div className="flex max-w-3xl flex-col gap-4">{children}</div>
    </section>
  );
}

const fmt = (v: number) => toArabicDigits(Number(v.toFixed(3))).replace('.', '٫');

export function PrinterPage() {
  const printer = usePrinter();
  const { profiles, profile, calibration, renderer, selectPrinter, updateProfile, updateCalibration } = printer;
  const { shaper } = useShaper();
  const templates = useLiveQuery(() => orderedTemplates(), []);
  const [templateId, setTemplateId] = useState('');
  const [message, setMessage] = useState('');
  const [newName, setNewName] = useState('');
  const [measuredLength, setMeasuredLength] = useState('');
  const [measuredWidth, setMeasuredWidth] = useState('');

  const template = templates?.find((t) => t.id === templateId) ?? templates?.[0];
  const trialDone = useLiveQuery(
    () => (profile && template ? db.settings.get(trialKey(profile.id, template.id)).then((e) => Boolean(e?.value)) : false),
    [profile?.id, template?.id],
  );

  const setup = useMemo(
    () => (template && profile ? buildPageSetup(template.lengthMm, template.widthMm, profile, calibration) : null),
    [template, profile, calibration],
  );

  if (!profile || !template || !setup) return null;

  const open = async (bytes: Uint8Array, name: string) => {
    const result = await deliverPdf(toPdfBlob(bytes), name);
    setMessage(result === 'blocked' ? 'المتصفح منع فتح الملف، فاتنزّل على جهازك. افتحه واطبعه.' : '');
  };

  const printDirection = async () => shaper && open(await createDirectionPdf(template, profile, calibration, shaper), 'تحديد الاتجاه.pdf');
  const printCalibration = async () => shaper && open(await createCalibrationPdf(template, profile, calibration, shaper), 'صفحة معايرة.pdf');
  const printTrial = async () => {
    if (!shaper) return;
    const model = layoutCheque(template, SAMPLE, shaper);
    await open(await createChequePdf({ model, setup, shaper, renderer }), 'تجربة طباعة.pdf');
  };

  const applyOutcome = async (outcome: OutcomeId) => {
    if (outcome === 'correct') setMessage('تمام، الاتجاه مظبوط. كمّل المعايرة.');
    if (outcome === 'backFace') setMessage('الطابعة بتطبع على الوش التاني. اقلب الورقة في الدرج وجرّب تاني.');
    if (outcome === 'flipped') {
      await updateProfile({ rotation: ((profile.rotation + 180) % 360) as Rotation });
      setMessage('عدّلنا الاتجاه. اطبع صفحة الاتجاه تاني واتأكد.');
    }
    if (outcome === 'mirrored') {
      await updateProfile({ mirrored: !profile.mirrored });
      setMessage('عدّلنا الاتجاه. اطبع صفحة الاتجاه تاني واتأكد.');
    }
  };

  const nudge = (dx: number, dy: number) => updateCalibration({
    offsetX: calibration.offsetX + dx * STEP_MM,
    offsetY: calibration.offsetY + dy * STEP_MM,
  });

  const applyMeasured = async () => {
    const parse = (text: string) => Number(toLatinDigits(text).replace('٫', '.'));
    const [length, width] = [parse(measuredLength), parse(measuredWidth)];
    if (!(length > 50) || !(width > 50)) {
      setMessage('اكتب طول المسطرتين بالمليمتر زي ما قستهم.');
      return;
    }
    await updateCalibration({
      scaleX: correctedScale(calibration.scaleX, RULER_LENGTH_MM, length),
      scaleY: correctedScale(calibration.scaleY, RULER_LENGTH_MM, width),
    });
    setMeasuredLength('');
    setMeasuredWidth('');
    setMessage('اتحسب التصحيح. اطبع الصفحة تاني، المسطرتين لازم يطلعوا ١٠٠ مم.');
  };

  const addProfile = async () => {
    const name = newName.trim();
    if (!name) return;
    const created: PrinterProfile = { ...profile, id: newId(), name, builtin: false, updatedAt: Date.now() };
    await db.printerProfiles.add(created);
    await selectPrinter(created.id);
    setNewName('');
  };

  const isToshiba = profile.builtin;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="الطابعة والمعايرة" description="امشي على الخطوات بالترتيب مرة واحدة لكل جهاز بيطبع." />
      {message && <Notice tone="info">{message}</Notice>}

      <div className="grid max-w-3xl gap-4 md:grid-cols-2">
        <Select label="الطابعة" value={profile.id} onChange={(v) => void selectPrinter(v)}>
          {profiles?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Select label="القالب" value={template.id} onChange={setTemplateId}>
          {templates?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      </div>

      <Section title="إزاي تحط الشيك">
        <div className="grid items-start gap-6 md:grid-cols-2">
          <TrayIllustration />
          <ol className="flex list-inside list-[arabic-indic] flex-col gap-2">
            <li>حط الشيك في <strong>الدرج الأمامي اليدوي</strong>، في نصه بالظبط.</li>
            <li><strong>بالطول</strong>: الحافة القصيرة تدخل الأول. الإدخال بالعرض بيعمل انحشار ورق.</li>
            <li><strong>الوش لفوق</strong>، و<strong>الحافة الشمال (ناحية الشعار)</strong> هي اللي تدخل الأول.</li>
            <li>اقفل الموجّهين على الشيك. لو بعاد عنه الورقة بتميل وتنحشر.</li>
          </ol>
        </div>
      </Section>

      {isToshiba && (
        <Section title="إعدادات لوحة الطابعة (مرة واحدة)">
          <p className="text-ink-soft">من الموبايل غالباً مش هتقدر تختار الدرج، فالطابعة نفسها لازم تسحب من الدرج الأمامي لما يكون فيه شيك.</p>
          <ol className="flex list-inside list-[arabic-indic] flex-col gap-3 leading-8">
            <li>زر المفتاح، ثم <Menu>Paper</Menu> ثم <Menu>Tray Configuration</Menu>.</li>
            <li>في <Menu>Paper Size/Type</Menu> اختار <Menu>MP Feeder Size</Menu> = {profile.pageMode === 'a4' ? <Menu>A4</Menu> : <Menu>Universal</Menu>}، و<Menu>MP Feeder Type</Menu> = <Menu>Plain Paper</Menu>.</li>
            <li><Menu>Configure MP</Menu> = <Menu>First</Menu> لو ظهر، عشان تسحب من الأمامي لما يكون فيه شيك.</li>
            <li><Menu>Substitute Size</Menu> = <Menu>All Listed</Menu>.</li>
            <li><Menu>Default Source</Menu> يفضل <Menu>Tray 1</Menu>. البديل <Menu>MP Feeder</Menu> لو الطابعة فضلت تطلب الدرج ١، وساعتها كل طباعة المكتب هتسحب من الأمامي.</li>
            {profile.pageMode === 'chequeSize' && (
              <li><Menu>Paper</Menu> ثم <Menu>Media Configuration</Menu> ثم <Menu>Universal Setup</Menu>: الوحدة <Menu>Millimeters</Menu>، <Menu>Portrait Width</Menu> = {toArabicDigits(template.widthMm)}، <Menu>Portrait Height</Menu> = {toArabicDigits(template.lengthMm)}.</li>
            )}
          </ol>
          <details>
            <summary className="flex min-h-11 items-center font-semibold">لو ظهرت مشكلة</summary>
            <ul className="flex list-inside list-disc flex-col gap-3 leading-8">
              <li>رسالة <Menu>Load Tray 1 with Plain...</Menu>: ألغِ المهمة بزر X، واتأكد من <Menu>MP Feeder Size</Menu>، وابعت تاني.</li>
              <li>انحشار برقم ٢٠٢: افتح الباب الأمامي وطلّع الورقة، واتأكد إن الشيك داخل بالطول.</li>
              <li>على الكمبيوتر: في خصائص الطابعة خلّي <Menu>Paper Source</Menu> = <Menu>Manual Feed</Menu> أو <Menu>Automatically Select</Menu>، مش <Menu>Tray 1</Menu>.</li>
            </ul>
          </details>
        </Section>
      )}

      <Section title="شكل الصفحة">
        <div className="grid gap-4 md:grid-cols-2">
          <Select label="مقاس صفحة الطباعة" value={profile.pageMode} onChange={(v) => void updateProfile({ pageMode: v as PageMode })} hint="صفحة بمقاس الشيك لو الوضع العادي عمل انحشار أو رسالة عدم تطابق مقاس.">
            <option value="a4">صفحة كاملة (الافتراضي)</option>
            <option value="chequeSize">صفحة بمقاس الشيك</option>
          </Select>
          {!isToshiba && (
            <>
              <Select label="التدوير" value={String(profile.rotation)} onChange={(v) => void updateProfile({ rotation: Number(v) as Rotation })}>
                {[0, 90, 180, 270].map((r) => <option key={r} value={r}>{toArabicDigits(r)} درجة</option>)}
              </Select>
              <Select label="المحاذاة في الدرج" value={profile.align} onChange={(v) => void updateProfile({ align: v as PageAlign })}>
                <option value="center">منتصف</option><option value="right">يمين</option><option value="left">شمال</option>
              </Select>
            </>
          )}
        </div>
        <Select label="طريقة رسم الكلام" value={renderer} onChange={(v) => void setSetting('pdfRenderer', v as PdfRenderer)} hint="المسارات أنقى وأصغر. جرّب الطريقة التانية لو الطابعة طلّعت حروف ناقصة.">
          <option value="vector">مسارات (موصى بها)</option>
          <option value="canvas">صورة بدقة ٦٠٠</option>
        </Select>
      </Section>

      <Section title="١. تحديد الاتجاه">
        <p>اطبع الصفحة دي على ورقة مقصوصة بمقاس الشيك، وامسكها زي ما بتقرا الشيك، واختار اللي طلع معاك.</p>
        <Button className="self-start" onClick={() => void printDirection()}>اطبع صفحة الاتجاه</Button>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {OUTCOMES.map((o) => (
            <button key={o.id} type="button" className="rounded-md border border-rule-strong bg-surface p-2 text-sm font-semibold hover:bg-sunken" onClick={() => void applyOutcome(o.id)}>
              <OutcomeIllustration outcome={o.id} />
              <span className="mt-1 block">{o.label}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="٢. المعايرة">
        <p>اطبع صفحة المعايرة على ورق عادي <strong>من نفس الجهاز</strong> اللي هتطبع منه، وقِس المسطرتين. بعض نوافذ الطباعة بتصغّر الصفحة من نفسها، والخطوة دي بتعوّض ده.</p>
        <Button className="self-start" onClick={() => void printCalibration()}>اطبع صفحة المعايرة</Button>
        <div className="grid grid-cols-2 gap-3">
          <DigitInput label="المسطرة الموازية لطول الشيك طلعت (مم)" value={measuredLength} onChange={setMeasuredLength} />
          <DigitInput label="المسطرة الموازية لعرض الشيك طلعت (مم)" value={measuredWidth} onChange={setMeasuredWidth} />
        </div>
        <Button className="self-start" onClick={() => void applyMeasured()}>احسب التصحيح</Button>
        <p className="text-sm text-ink-soft">
          على الجهاز ده: إزاحة أفقية {fmt(calibration.offsetX)} مم ، رأسية {fmt(calibration.offsetY)} مم ، نسبة الطول {fmt(calibration.scaleX)} ، نسبة العرض {fmt(calibration.scaleY)}
        </p>
      </Section>

      <Section title="٣. تجربة على ورقة مقصوصة">
        <p>صوّر الشيك <strong>بالحجم الأصلي ١٠٠٪</strong> وقصّ الصورة بنفس أبعاده، واطبع عليها. حط الورقة فوق الشيك الأصلي قدام النور وقارن.</p>
        <Button className="self-start" onClick={() => void printTrial()}>اطبع تجربة</Button>

        <p className="font-semibold">الكلام طلع فين؟ كل ضغطة بتعدّل نص مليمتر.</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {SHIFTS.map((s) => (
            <button key={s.id} type="button" className="rounded-md border border-rule-strong bg-surface p-2 text-sm font-semibold hover:bg-sunken" onClick={() => void nudge(s.dx, s.dy)}>
              <ShiftIllustration shift={s.id} />
              <span className="mt-1 block">{s.label}</span>
            </button>
          ))}
        </div>
        <Notice tone="info">لو الكلام طلع مايل: اقفل الموجّهين كويس على الورقة وجرّب تاني. الميل بييجي من الدرج مش من الملف.</Notice>

        {trialDone ? (
          <Notice tone="info">التجربة نجحت للقالب ده على الطابعة دي.</Notice>
        ) : (
          <Button variant="primary" className="self-start" onClick={() => void setSetting(trialKey(profile.id, template.id), true)}>التجربة نجحت، الكلام في مكانه</Button>
        )}
      </Section>

      <Section title="طابعة تانية">
        <div className="flex flex-wrap items-end gap-2">
          <TextInput label="اسم الطابعة" value={newName} onChange={setNewName} wrapperClassName="grow" />
          <Button onClick={() => void addProfile()}>إضافة ملف طابعة</Button>
        </div>
      </Section>
    </div>
  );
}
