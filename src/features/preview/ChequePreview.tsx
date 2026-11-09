import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { applyMatrix, rotationAround, translation, compose } from '@/core/geometry';
import { toArabicDigits } from '@/core/digits';
import type { PrintModel, PrintText } from '@/core/layout';
import { BANK_TINT, DEFAULT_BANK_TINT } from '@/core/templates';
import type { ChequeTemplate } from '@/core/types';
import { db } from '@/db/schema';
import { commandsToSvgPath, transformCommands, type Shaper } from '@/print/shaper';

const INK = { blue: 'oklch(0.33 0.12 262)', black: 'oklch(0.2 0.01 262)' };
const PRINTED = 'oklch(0.55 0.02 260)';
const PRINTED_FAINT = 'oklch(0.72 0.015 260)';

export function useStoredImageUrl(imageId?: string): string | undefined {
  const image = useLiveQuery(() => (imageId ? db.images.get(imageId) : undefined), [imageId]);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!image) { setUrl(undefined); return; }
    const objectUrl = URL.createObjectURL(image.data);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [image]);
  return url;
}

function GlyphText({ item, shaper, fill }: { item: PrintText; shaper: Shaper; fill: string }) {
  const d = useMemo(() => {
    const { commands } = shaper.outline(item);
    let matrix = translation(item.x, item.y);
    if (item.angleDeg) matrix = compose(matrix, rotationAround(item.angleDeg, item.pivot.x, item.pivot.y));
    return commandsToSvgPath(transformCommands(commands, matrix));
  }, [item, shaper]);
  return <path key={item.text} className="ink-in" d={d} fill={fill} />;
}

/** خلفية محايدة أو صورة شيك المحاسب. لا تحتوي تصميم أو شعار أي بنك. */
function ChequeBackground({ template, chequeNumber, imageUrl }: {
  template: ChequeTemplate; chequeNumber?: string; imageUrl?: string;
}) {
  const { lengthMm: L, widthMm: W, micrLineY, signatureBox: sig, crossingGuide: guide, date } = template;

  if (imageUrl) return <image href={imageUrl} x={0} y={0} width={L} height={W} preserveAspectRatio="none" />;

  const [lineA1, lineA2] = [applyMatrix(translation(-1.5, 0), guide.x, guide.y + guide.h), applyMatrix(translation(-1.5, 0), guide.x + guide.w, guide.y)];
  const [lineB1, lineB2] = [applyMatrix(translation(1.5, 0), guide.x, guide.y + guide.h), applyMatrix(translation(1.5, 0), guide.x + guide.w, guide.y)];
  const hints: [string, number][] = [
    ['المستفيد', template.payee.y + template.payee.h],
    ['المبلغ', template.amountWords.line1.y + template.amountWords.line1.h],
    ['', template.amountWords.line2.y + template.amountWords.line2.h],
  ];

  return (
    <>
      <rect width={L} height={W} fill={BANK_TINT[template.bankName] ?? DEFAULT_BANK_TINT} />
      <text x={L - 5} y={9} textAnchor="start" fontSize={4} fontWeight={700} fill={PRINTED}>{template.bankName}</text>
      <text x={L / 2} y={8} textAnchor="middle" fontSize={3.2} fill={PRINTED}>شيك</text>
      {chequeNumber && (
        <text x={L / 2} y={13} textAnchor="middle" fontSize={3} fill={PRINTED} direction="ltr">{toArabicDigits(chequeNumber)}</text>
      )}

      {hints.map(([label, y], index) => (
        <g key={index}>
          <line x1={8} x2={L - 6} y1={y} y2={y} stroke={PRINTED_FAINT} strokeWidth={0.15} />
          {label && <text x={L - 7} y={y - 1} fontSize={2.3} fill={PRINTED}>{label}</text>}
        </g>
      ))}

      {date.mode === 'cells' && Array.from({ length: 8 }, (_, i) => (
        <rect
          key={i} x={date.firstCellCenterX + (i - 0.5) * date.cellPitch} y={date.y}
          width={date.cellPitch} height={date.h} fill="none" stroke={PRINTED_FAINT} strokeWidth={0.15}
        />
      ))}

      <line x1={lineA1[0]} y1={lineA1[1]} x2={lineA2[0]} y2={lineA2[1]} stroke={PRINTED} strokeWidth={0.25} />
      <line x1={lineB1[0]} y1={lineB1[1]} x2={lineB2[0]} y2={lineB2[1]} stroke={PRINTED} strokeWidth={0.25} />

      <rect x={0} y={micrLineY} width={L} height={W - micrLineY} fill="oklch(0.86 0.008 260 / 0.45)" />
      <line x1={0} x2={L} y1={micrLineY} y2={micrLineY} stroke={PRINTED} strokeWidth={0.2} />
      <text x={L / 2} y={micrLineY + 5} textAnchor="middle" fontSize={2.6} fill={PRINTED}>ممنوع الكتابة تحت هذا الخط</text>

      <rect x={sig.x} y={sig.y} width={sig.w} height={sig.h} fill="oklch(0.8 0.006 260 / 0.45)" rx={0.8} />
      <text x={sig.x + sig.w / 2} y={sig.y + sig.h / 2 + 1} textAnchor="middle" fontSize={3} fill={PRINTED}>مكان التوقيع</text>
    </>
  );
}

interface ChequePreviewProps {
  template: ChequeTemplate;
  model: PrintModel | null;
  shaper: Shaper | null;
  chequeNumber?: string;
  label: string;
  ink?: keyof typeof INK;
}

/** لوحة بأبعاد الشيك الفعلية بالمليمتر، وتكبر مع عرض الحاوية. */
export function ChequePreview({ template, model, shaper, chequeNumber, label, ink = 'blue' }: ChequePreviewProps) {
  const imageUrl = useStoredImageUrl(template.imageId);
  return (
    <svg
      viewBox={`0 0 ${template.lengthMm} ${template.widthMm}`} role="img" aria-label={label}
      className="block h-auto w-full rounded-sm" style={{ boxShadow: 'var(--cheque-shadow)', touchAction: 'pinch-zoom' }}
      fontFamily="Cairo, sans-serif" direction="rtl"
    >
      <ChequeBackground template={template} chequeNumber={chequeNumber} imageUrl={imageUrl} />
      {model?.rules.map((rule, index) => (
        <line key={index} x1={rule.x1} y1={rule.y1} x2={rule.x2} y2={rule.y2} stroke={INK[ink]} strokeWidth={rule.thicknessMm} />
      ))}
      {shaper && model?.texts.map((item, index) => (
        <GlyphText key={`${item.field}-${index}-${item.text}`} item={item} shaper={shaper} fill={INK[ink]} />
      ))}
    </svg>
  );
}
