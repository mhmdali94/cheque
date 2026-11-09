/**
 * يحوّل القالب والقيم إلى نموذج طباعة بالمليمتر.
 * المعاينة وملف PDF يرسمان من نفس النموذج، فما يظهر على الشاشة هو ما يُطبع.
 */
import type { TextDirection } from './bidi';
import { dateCells, formatDate } from './date';
import { formatProtectedAmount, type AmountProtection, toArabicDigits } from './digits';
import { rotationAround, applyMatrix } from './geometry';
import { resolveTafqeetOptions, tafqeet } from './tafqeet';
import type { ChequeTemplate, CrossingValue, TextField } from './types';

export interface MeasureRequest {
  text: string;
  dir: TextDirection;
  sizePt: number;
  bold: boolean;
}

export interface Measurer {
  measure(request: MeasureRequest): number;
  hasMissingGlyphs(request: MeasureRequest): boolean;
}

export type FieldKey =
  | 'date' | 'payee' | 'amountWords1' | 'amountWords2' | 'amountDigits'
  | 'crossing' | 'signatoryName' | 'memo' | 'stubDate' | 'stubPayee' | 'stubAmount';

export interface PrintText {
  field: FieldKey;
  text: string;
  dir: TextDirection;
  sizePt: number;
  bold: boolean;
  /** بداية السطر من الشمال على خط الأساس. */
  x: number;
  y: number;
  widthMm: number;
  /** دوران مع عقارب الساعة حول pivot. */
  angleDeg: number;
  pivot: { x: number; y: number };
}

export interface PrintRule {
  field: FieldKey;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thicknessMm: number;
}

export type LayoutIssue =
  | { kind: 'overflow'; field: FieldKey }
  | { kind: 'shrunk'; field: FieldKey; sizePt: number }
  | { kind: 'forbidden'; field: FieldKey }
  | { kind: 'missingGlyph'; field: FieldKey };

export interface PrintModel {
  texts: PrintText[];
  rules: PrintRule[];
  issues: LayoutIssue[];
}

export interface ChequeValues {
  payee: string;
  amount: number | null;
  date: string;
  memo: string;
  signatoryName: string;
  crossing: CrossingValue;
  printStub: boolean;
  tafqeetPresetId: string;
  customPattern?: string;
  amountProtection: AmountProtection;
}

/** خط الأساس بالنسبة لمربع الحقل، عشان نقط الحروف تفضل جوه المربع. */
const BASELINE_RATIO = 0.74;
const FONT_STEP = 0.25;
const FILL_GAP_MM = 1.2;
const FILL_RAISE_MM = 1;
const RULE_THICKNESS_MM = 0.25;

const baselineOf = (field: TextField) => field.y + field.h * BASELINE_RATIO;

function alignedX(field: TextField, widthMm: number): number {
  if (field.align === 'center') return field.x + (field.w - widthMm) / 2;
  return field.align === 'right' ? field.x + field.w - widthMm : field.x;
}

const fieldCenter = (field: TextField) => ({ x: field.x + field.w / 2, y: field.y + field.h / 2 });

export const CROSSING_TEXT: Record<Exclude<CrossingValue['kind'], 'none' | 'special' | 'free'>, string> = {
  firstBeneficiary: 'يصرف للمستفيد الأول',
  notNegotiable: 'غير قابل للتداول',
};

export function crossingText(value: CrossingValue): string {
  switch (value.kind) {
    case 'none': return '';
    case 'special':
    case 'free': return value.text.trim();
    default: return CROSSING_TEXT[value.kind];
  }
}

/** كلمات لا تُفصل عن بعضها في نهاية سطر. */
const KEEP_TOGETHER = /(جنيه مصري|جنيهات مصرية|جنيهاً مصرياً|جنيهان مصريان|جنيه واحد|لا غير)/g;

export function tokenizeWords(text: string): string[] {
  const glued = text.replace(KEEP_TOGETHER, (match) => match.replace(/ /g, '\u0001'));
  return glued.split(' ').filter(Boolean).map((token) => token.replace(/\u0001/g, ' '));
}

class Builder {
  readonly model: PrintModel = { texts: [], rules: [], issues: [] };
  private readonly measurer: Measurer;
  private readonly micrLineY: number;

  constructor(measurer: Measurer, micrLineY: number) {
    this.measurer = measurer;
    this.micrLineY = micrLineY;
  }

  width(text: string, dir: TextDirection, sizePt: number, bold: boolean): number {
    return this.measurer.measure({ text, dir, sizePt, bold });
  }

  fit(text: string, field: TextField, dir: TextDirection, key: FieldKey): number {
    let size = field.fontSizePt;
    while (size > field.minFontSizePt && this.width(text, dir, size, field.bold) > field.w) {
      size = Math.max(size - FONT_STEP, field.minFontSizePt);
    }
    if (this.width(text, dir, size, field.bold) > field.w) {
      this.model.issues.push({ kind: 'overflow', field: key });
    } else if (size < field.fontSizePt) {
      this.model.issues.push({ kind: 'shrunk', field: key, sizePt: size });
    }
    return size;
  }

  checkForbidden(field: TextField, key: FieldKey): void {
    if (field.y + field.h > this.micrLineY && !this.model.issues.some((i) => i.kind === 'forbidden' && i.field === key)) {
      this.model.issues.push({ kind: 'forbidden', field: key });
    }
  }

  place(text: string, field: TextField, key: FieldKey, dir: TextDirection, sizePt: number, angleDeg = 0): PrintText {
    const widthMm = this.width(text, dir, sizePt, field.bold);
    const item: PrintText = {
      field: key, text, dir, sizePt, bold: field.bold,
      x: alignedX(field, widthMm), y: baselineOf(field), widthMm, angleDeg, pivot: fieldCenter(field),
    };
    this.model.texts.push(item);
    this.checkForbidden(field, key);
    if (this.measurer.hasMissingGlyphs({ text, dir, sizePt, bold: field.bold })) {
      this.model.issues.push({ kind: 'missingGlyph', field: key });
    }
    return item;
  }

  simple(text: string, field: TextField, key: FieldKey, dir: TextDirection = 'rtl'): void {
    const value = text.trim();
    if (!field.enabled || !value) return;
    this.place(value, field, key, dir, this.fit(value, field, dir, key));
  }
}

/** أكبر عدد كلمات يملأ السطر الأول، مع تفضيل الفصل قبل واو العطف. */
function splitIntoLines(
  words: string[], fits: (text: string, line: 1 | 2) => boolean,
): [string, string] | null {
  let count = 0;
  while (count < words.length && fits(words.slice(0, count + 1).join(' '), 1)) count++;
  if (count === 0) return null;

  const rest = (k: number) => words.slice(k).join(' ');
  if (count < words.length && !words[count].startsWith('و') && count > 1 && words[count - 1].startsWith('و')) {
    if (fits(rest(count - 1), 2)) count -= 1;
  }
  if (rest(count) && !fits(rest(count), 2)) return null;
  return [words.slice(0, count).join(' '), rest(count)];
}

function layoutAmountWords(builder: Builder, template: ChequeTemplate, text: string): void {
  const { line1, line2, fillRemainder } = template.amountWords;
  const words = tokenizeWords(text);
  const bold = line1.bold;

  let size = line1.fontSizePt;
  let lines: [string, string] | null = null;
  for (; size >= line1.minFontSizePt; size -= FONT_STEP) {
    const currentSize = size;
    lines = splitIntoLines(words, (candidate, line) =>
      builder.width(candidate, 'rtl', currentSize, bold) <= (line === 1 ? line1.w : line2.w));
    if (lines) break;
  }

  if (!lines) {
    size = line1.minFontSizePt;
    builder.model.issues.push({ kind: 'overflow', field: 'amountWords1' });
    const half = Math.ceil(words.length / 2);
    lines = [words.slice(0, half).join(' '), words.slice(half).join(' ')];
  } else if (size < line1.fontSizePt) {
    builder.model.issues.push({ kind: 'shrunk', field: 'amountWords1', sizePt: size });
  }

  const addFill = (field: TextField, key: FieldKey, textLeft: number) => {
    const end = textLeft - FILL_GAP_MM;
    if (!fillRemainder || end <= field.x) return;
    const y = baselineOf(field) - FILL_RAISE_MM;
    builder.model.rules.push({ field: key, x1: field.x, y1: y, x2: end, y2: y, thicknessMm: RULE_THICKNESS_MM });
  };

  const first = builder.place(lines[0], line1, 'amountWords1', 'rtl', size);
  addFill(line1, 'amountWords1', first.x);
  if (lines[1]) {
    const second = builder.place(lines[1], line2, 'amountWords2', 'rtl', size);
    addFill(line2, 'amountWords2', second.x);
  } else {
    addFill(line2, 'amountWords2', line2.x + line2.w + FILL_GAP_MM);
  }
}

function layoutDate(builder: Builder, template: ChequeTemplate, iso: string): void {
  const field = template.date;
  if (!field.enabled || !iso) return;
  if (field.mode === 'text') {
    builder.simple(formatDate(iso), field, 'date', 'ltr');
    return;
  }
  const cells = dateCells(iso);
  cells.forEach((digit, index) => {
    const slot = field.cellOrder === 'ltr' ? index : cells.length - 1 - index;
    const center = field.firstCellCenterX + slot * field.cellPitch;
    const widthMm = builder.width(digit, 'ltr', field.fontSizePt, field.bold);
    builder.model.texts.push({
      field: 'date', text: digit, dir: 'ltr', sizePt: field.fontSizePt, bold: field.bold,
      x: center - widthMm / 2, y: baselineOf(field), widthMm, angleDeg: 0, pivot: fieldCenter(field),
    });
  });
  builder.checkForbidden(field, 'date');
}

function layoutCrossing(builder: Builder, template: ChequeTemplate, value: CrossingValue): void {
  const field = template.crossing;
  if (!field.enabled) return;
  const text = crossingText(value);
  if (text) {
    builder.place(text, field, 'crossing', 'rtl', builder.fit(text, field, 'rtl', 'crossing'), field.angleDeg);
  }
  if (value.drawLines) {
    const { x: cx, y: cy } = fieldCenter(field);
    const rotate = rotationAround(field.angleDeg, cx, cy);
    for (const offset of [-field.lineGapMm / 2, field.lineGapMm / 2]) {
      const [x1, y1] = applyMatrix(rotate, field.x, cy + offset);
      const [x2, y2] = applyMatrix(rotate, field.x + field.w, cy + offset);
      builder.model.rules.push({ field: 'crossing', x1, y1, x2, y2, thicknessMm: 0.3 });
    }
  }
}

export function amountInWords(values: Pick<ChequeValues, 'amount' | 'tafqeetPresetId' | 'customPattern'>): string {
  if (values.amount === null) return '';
  return tafqeet(values.amount, resolveTafqeetOptions(values.tafqeetPresetId, values.customPattern));
}

export function layoutCheque(template: ChequeTemplate, values: ChequeValues, measurer: Measurer): PrintModel {
  const builder = new Builder(measurer, template.micrLineY);

  layoutDate(builder, template, values.date);
  builder.simple(toArabicDigits(values.payee), template.payee, 'payee');

  if (values.amount !== null) {
    layoutAmountWords(builder, template, amountInWords(values));
    const digits = formatProtectedAmount(values.amount, values.amountProtection, template.amountDigits.signSide);
    builder.simple(digits, template.amountDigits, 'amountDigits', 'ltr');
  }

  layoutCrossing(builder, template, values.crossing);
  builder.simple(toArabicDigits(values.signatoryName), template.signatoryName, 'signatoryName');
  builder.simple(toArabicDigits(values.memo), template.memo, 'memo');

  if (values.printStub && template.stub.enabled) {
    const { stub } = template;
    const enabled = (field: TextField): TextField => ({ ...field, enabled: true });
    builder.simple(formatDate(values.date), enabled(stub.date), 'stubDate', 'ltr');
    builder.simple(toArabicDigits(values.payee), enabled(stub.payee), 'stubPayee');
    if (values.amount !== null) {
      builder.simple(formatProtectedAmount(values.amount, values.amountProtection), enabled(stub.amount), 'stubAmount', 'ltr');
    }
  }

  return builder.model;
}
