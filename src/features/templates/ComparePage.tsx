import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Box, ChequeTemplate } from '@/core/types';
import { orderedTemplates } from '@/features/companies/data';
import { Notice, PageHeader, Select } from '@/ui/controls';

function ModelOverlay({ template, photoUrl, opacity }: { template: ChequeTemplate; photoUrl: string; opacity: number }) {
  const boxes: Box[] = [
    template.date, template.payee, template.amountWords.line1, template.amountWords.line2,
    template.amountDigits, template.signatoryName, template.signatureBox,
  ];
  return (
    <figure>
      <svg viewBox={`0 0 ${template.lengthMm} ${template.widthMm}`} className="block w-full rounded-sm" role="img" aria-label={`صورتك فوق ${template.modelName}`}>
        <image href={photoUrl} width={template.lengthMm} height={template.widthMm} preserveAspectRatio="none" />
        <g opacity={opacity}>
          {boxes.map((b, i) => <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill="oklch(0.55 0.15 165 / 0.3)" stroke="oklch(0.4 0.12 165)" strokeWidth={0.3} />)}
          <line x1={0} x2={template.lengthMm} y1={template.micrLineY} y2={template.micrLineY} stroke="oklch(0.5 0.17 27)" strokeWidth={0.4} />
        </g>
      </svg>
      <figcaption className="mt-1">
        <Link to={`/templates/${template.id}`} className="font-semibold text-accent underline">{template.modelName}</Link>
      </figcaption>
    </figure>
  );
}

/** مقارنة صورة الشيك بأماكن حقول كل نموذج، عشان المحاسب يختار الأقرب. */
export function ComparePage() {
  const templates = useLiveQuery(() => orderedTemplates(), []);
  const [bank, setBank] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string>();
  const [opacity, setOpacity] = useState(0.8);

  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  const banks = [...new Set(templates?.map((t) => t.bankName))];
  const selectedBank = bank || banks[0] || '';

  return (
    <>
      <PageHeader title="قارن شيكك بالنماذج" />
      <div className="mb-6 flex max-w-lg flex-col gap-4">
        <Notice tone="info">اسم البنك لوحده مش كفاية: طابق شكل الورقة، واختار النموذج اللي المربعات فيه راكبة على خانات شيكك.</Notice>
        <Select label="البنك" value={selectedBank} onChange={setBank}>{banks.map((b) => <option key={b}>{b}</option>)}</Select>
        <label className="inline-flex min-h-11 w-fit cursor-pointer items-center rounded-md border border-rule-strong bg-surface px-4 text-sm font-semibold hover:bg-sunken focus-within:outline-2 focus-within:outline-accent">
          صوّر شيكك أو ارفع صورته
          <input
            type="file" accept="image/*" capture="environment" className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) setPhotoUrl(URL.createObjectURL(f)); }}
          />
        </label>
        {photoUrl && (
          <label className="flex flex-col gap-1 text-sm font-semibold">
            شفافية المربعات
            <input type="range" min={0.1} max={1} step={0.1} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="accent-[var(--accent)]" />
          </label>
        )}
      </div>
      {photoUrl ? (
        <div className="grid gap-6 md:grid-cols-2">
          {templates?.filter((t) => t.bankName === selectedBank).map((t) => <ModelOverlay key={t.id} template={t} photoUrl={photoUrl} opacity={opacity} />)}
        </div>
      ) : (
        <p className="max-w-lg text-ink-soft">صوّر الشيك من فوقه مباشرة، بحيث يملأ الصورة، وهتظهر فوقه أماكن الحقول لكل نموذج.</p>
      )}
    </>
  );
}
