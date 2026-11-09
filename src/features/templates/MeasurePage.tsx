import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { toArabicDigits, toLatinDigits } from '@/core/digits';
import { db } from '@/db/schema';
import { Button, DigitInput, Notice, PageHeader } from '@/ui/controls';

function RulerIllustration({ measuring }: { measuring: 'length' | 'width' }) {
  const line = 'oklch(0.45 0.1 165)';
  return (
    <svg viewBox="0 0 220 120" className="w-full max-w-md" role="img" aria-label={measuring === 'length' ? 'المسطرة بطول الشيك' : 'المسطرة بعرض الشيك'} fontFamily="Cairo, sans-serif">
      <rect x="25" y="20" width="174" height="84" rx="2" fill="oklch(0.95 0.015 88)" stroke="oklch(0.6 0.02 88)" />
      <line x1="25" y1="85" x2="199" y2="85" stroke="oklch(0.7 0.02 88)" strokeDasharray="3 2" />
      {measuring === 'length' ? (
        <g stroke={line} strokeWidth="1.5">
          <line x1="25" y1="10" x2="199" y2="10" />
          <line x1="25" y1="5" x2="25" y2="15" />
          <line x1="199" y1="5" x2="199" y2="15" />
        </g>
      ) : (
        <g stroke={line} strokeWidth="1.5">
          <line x1="12" y1="20" x2="12" y2="104" />
          <line x1="7" y1="20" x2="17" y2="20" />
          <line x1="7" y1="104" x2="17" y2="104" />
        </g>
      )}
      <text x="112" y="58" textAnchor="middle" fontSize="11" fill="oklch(0.4 0.02 88)">
        {measuring === 'length' ? 'من الحافة الشمال لليمين' : 'من الحافة العليا لتحت'}
      </text>
    </svg>
  );
}

/** معالج قياس الشيك بالمسطرة، لأن مفيش أبعاد رسمية منشورة. */
export function MeasurePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const template = useLiveQuery(() => db.templates.get(id ?? ''), [id]);
  const [step, setStep] = useState(0);
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [hasStub, setHasStub] = useState(false);
  const [stubWidth, setStubWidth] = useState('40');

  useEffect(() => {
    if (!template) return;
    setLength(String(template.lengthMm));
    setWidth(String(template.widthMm));
    setHasStub(template.stub.enabled);
    setStubWidth(String(template.stub.widthMm));
  }, [template?.id]);

  if (!template) return null;

  const parse = (value: string) => Number(toLatinDigits(value).replace('٫', '.'));
  const lengthMm = parse(length);
  const widthMm = parse(width);
  const stubMm = parse(stubWidth);
  const valid = lengthMm >= 100 && lengthMm <= 300 && widthMm >= 50 && widthMm <= 150 && widthMm < lengthMm && (!hasStub || stubMm > 0);

  const finish = async () => {
    await db.templates.update(template.id, {
      lengthMm, widthMm, accuracy: 'adjusted', updatedAt: Date.now(),
      stub: { ...template.stub, enabled: hasStub, widthMm: stubMm || template.stub.widthMm },
    });
    navigate(`/templates/${template.id}`);
  };

  const steps = [
    <div key="length" className="flex flex-col gap-4">
      <RulerIllustration measuring="length" />
      <p>قِس طول الشيك بالمسطرة بالمليمتر، من الحافة للحافة، <strong>بدون الكعب</strong>.</p>
      <DigitInput label="طول الشيك بالمليمتر" value={length} onChange={setLength} />
    </div>,
    <div key="width" className="flex flex-col gap-4">
      <RulerIllustration measuring="width" />
      <p>قِس عرض الشيك بالمسطرة بالمليمتر، من الحافة العليا للحافة السفلى.</p>
      <DigitInput label="عرض الشيك بالمليمتر" value={width} onChange={setWidth} />
    </div>,
    <div key="stub" className="flex flex-col gap-4">
      <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={hasStub} onChange={(e) => setHasStub(e.target.checked)} />
        الشيك له كعب
      </label>
      {hasStub && <DigitInput label="عرض الكعب بالمليمتر" value={stubWidth} onChange={setStubWidth} hint="هتتطبع عليه بيانات مختصرة لو اخترت ده في الشيك." />}
      {!valid && <Notice tone="danger">راجع المقاسات: الطول بين ١٠٠ و٣٠٠ مم، والعرض بين ٥٠ و١٥٠ مم.</Notice>}
      {valid && <Notice tone="info">المقاس: {toArabicDigits(widthMm)} × {toArabicDigits(lengthMm)} مم. بعد الحفظ حرّك الحقول على مكانها في شيكك.</Notice>}
    </div>,
  ];

  return (
    <div className="max-w-xl">
      <PageHeader title="قياس الشيك" />
      <p className="mb-4 text-sm font-semibold text-ink-soft">خطوة {toArabicDigits(step + 1)} من {toArabicDigits(steps.length)} ، {template.name}</p>
      {steps[step]}
      <div className="mt-6 flex gap-2">
        {step > 0 && <Button onClick={() => setStep(step - 1)}>السابق</Button>}
        {step < steps.length - 1
          ? <Button variant="primary" onClick={() => setStep(step + 1)}>التالي</Button>
          : <Button variant="primary" disabled={!valid} onClick={() => void finish()}>حفظ المقاس</Button>}
      </div>
    </div>
  );
}
