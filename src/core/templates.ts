/** القوالب الجاهزة، مبنية من النسب المقاسة على صور شيكات حقيقية (دقتها حوالي ±٣٪). */
import type { Box, ChequeTemplate, TemplateAccuracy, TextField } from './types';

/** ارتفاع مربع الحقل، وكم يعلو خط الكتابة المطبوع داخل المربع. */
const FIELD_HEIGHT = 6.5;
const LINE_OFFSET = 5.5;

interface Range {
  top: number;
  from: number;
  to: number;
}

/** كل النسب مقاسة من الحافة العليا والحافة اليمنى. */
interface ChequeMeasurements {
  lengthMm: number;
  widthMm: number;
  date: Range;
  payee: Range;
  words1: Range;
  words2: Range;
  digits: Range;
  name: Range;
  signature: { topFrom: number; topTo: number; from: number; to: number };
  crossing: { topFrom: number; topTo: number; from: number; to: number };
  micrTop: number;
}

/** بداية السطر الأول من التفقيط، مقاسة بالتجربة على الشيك الفعلي، وواحدة لكل البنوك. */
const WORDS_START_FROM_RIGHT_MM = 65;
const wordsStartPercent = (lengthMm: number) => (WORDS_START_FROM_RIGHT_MM / lengthMm) * 100;

const AHLY: ChequeMeasurements = {
  lengthMm: 174,
  widthMm: 84,
  date: { top: 11, from: 10, to: 28 },
  payee: { top: 27, from: 10, to: 75 },
  words1: { top: 40, from: wordsStartPercent(174), to: 85 },
  words2: { top: 51, from: 10, to: 85 },
  digits: { top: 45, from: 4, to: 20 },
  name: { top: 63, from: 10, to: 45 },
  signature: { topFrom: 70, topTo: 80, from: 10, to: 45 },
  crossing: { topFrom: 5, topTo: 20, from: 71, to: 79 },
  micrTop: 81,
};

const ALEX: ChequeMeasurements = {
  lengthMm: 175,
  widthMm: 84,
  date: { top: 14, from: 9, to: 26 },
  payee: { top: 32, from: 6, to: 70 },
  words1: { top: 42, from: wordsStartPercent(175), to: 85 },
  words2: { top: 51, from: 20, to: 85 },
  digits: { top: 42, from: 5, to: 22 },
  name: { top: 54, from: 10, to: 45 },
  signature: { topFrom: 62, topTo: 72, from: 10, to: 45 },
  crossing: { topFrom: 5, topTo: 18, from: 39, to: 48 },
  micrTop: 77,
};

const round = (value: number) => Math.round(value * 100) / 100;

function textField(m: ChequeMeasurements, range: Range, sizePt: number, extra: Partial<TextField> = {}): TextField {
  return {
    x: round(m.lengthMm * (1 - range.to / 100)),
    y: round((m.widthMm * range.top) / 100 - LINE_OFFSET),
    w: round((m.lengthMm * (range.to - range.from)) / 100),
    h: FIELD_HEIGHT,
    fontSizePt: sizePt,
    minFontSizePt: 7,
    align: 'right',
    maxLines: 1,
    enabled: true,
    bold: false,
    ...extra,
  };
}

function regionBox(m: ChequeMeasurements, r: ChequeMeasurements['signature']): Box {
  return {
    x: round(m.lengthMm * (1 - r.to / 100)),
    y: round((m.widthMm * r.topFrom) / 100),
    w: round((m.lengthMm * (r.to - r.from)) / 100),
    h: round((m.widthMm * (r.topTo - r.topFrom)) / 100),
  };
}

function buildTemplate(
  id: string, bankName: string, modelName: string, m: ChequeMeasurements, accuracy: TemplateAccuracy,
): ChequeTemplate {
  const dateBase = textField(m, m.date, 11, { align: 'center', bold: true });
  const cellPitch = round(dateBase.w / 8);
  const guide = regionBox(m, m.crossing);
  const crossingLength = round(Math.hypot(guide.w, guide.h));

  const disabledBox = (y: number): TextField => ({
    x: round(m.lengthMm + 3), y, w: 30, h: FIELD_HEIGHT, fontSizePt: 8, minFontSizePt: 6,
    align: 'right', maxLines: 1, enabled: false, bold: false,
  });

  return {
    id, name: `${bankName}: ${modelName}`, bankName, modelName,
    lengthMm: m.lengthMm,
    widthMm: m.widthMm,
    accuracy,
    micrLineY: round((m.widthMm * m.micrTop) / 100),
    signatureBox: regionBox(m, m.signature),
    crossingGuide: guide,
    date: {
      ...dateBase, mode: 'cells',
      firstCellCenterX: round(dateBase.x + cellPitch / 2),
      cellPitch,
      cellOrder: 'ltr',
    },
    payee: textField(m, m.payee, 12, { bold: true }),
    amountWords: {
      line1: textField(m, m.words1, 11, { bold: true }),
      line2: textField(m, m.words2, 11, { bold: true }),
      fillRemainder: true,
    },
    amountDigits: { ...textField(m, m.digits, 12, { align: 'center', bold: true, minFontSizePt: 8 }), signSide: 'right' },
    crossing: {
      x: round(guide.x + guide.w / 2 - crossingLength / 2),
      y: round(guide.y + guide.h / 2 - 2.5),
      w: crossingLength,
      h: 5,
      fontSizePt: 8,
      minFontSizePt: 5,
      align: 'center',
      maxLines: 1,
      enabled: true,
      bold: true,
      angleDeg: -42,
      lineGapMm: 6,
    },
    signatoryName: textField(m, m.name, 10),
    memo: { ...textField(m, m.name, 9), enabled: false },
    stub: {
      enabled: false, widthMm: 40,
      date: disabledBox(15), payee: disabledBox(30), amount: disabledBox(45),
    },
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
  };
}

export const BANK_AHLY = 'البنك الأهلي المصري';
export const BANK_ALEX = 'بنك الإسكندرية';

/** أماكن الحقول في النماذج غير المقاسة منسوخة من النموذج المقاس لنفس البنك. */
export function builtinTemplates(): ChequeTemplate[] {
  return [
    buildTemplate('tpl-ahly-qr', BANK_AHLY, 'الحالي (برمز مربع)', AHLY, 'approximate'),
    buildTemplate('tpl-ahly-old', BANK_AHLY, 'قديم', AHLY, 'unmeasured'),
    buildTemplate('tpl-ahly-regular', BANK_AHLY, 'عادي', AHLY, 'unmeasured'),
    buildTemplate('tpl-ahly-3', BANK_AHLY, 'نموذج ٣', AHLY, 'unmeasured'),
    buildTemplate('tpl-ahly-platinum', BANK_AHLY, 'بلاتيني', AHLY, 'unmeasured'),
    buildTemplate('tpl-alex-1', BANK_ALEX, 'نموذج ١ (خاص)', ALEX, 'approximate'),
    buildTemplate('tpl-alex-2', BANK_ALEX, 'نموذج ٢', ALEX, 'unmeasured'),
  ];
}

export const ACCURACY_LABEL: Record<TemplateAccuracy, string> = {
  approximate: 'تقريبي: اضبطه على شيكك',
  unmeasured: 'غير مُقاس: اضبطه على شيكك',
  adjusted: 'مضبوط',
};

export const BANK_TINT: Record<string, string> = {
  [BANK_AHLY]: 'oklch(0.94 0.03 150)',
  [BANK_ALEX]: 'oklch(0.94 0.03 240)',
};

export const DEFAULT_BANK_TINT = 'oklch(0.95 0.015 85)';
