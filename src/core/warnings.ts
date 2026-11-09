/** التحذيرات قبل الطباعة. blocking يحتاج تأكيد صريح، والباقي للتنبيه فقط. */
import { addMonths, daysBetween, formatDate } from './date';
import { formatNumber, toArabicDigits } from './digits';
import { applyMatrix, type Matrix } from './geometry';
import type { FieldKey, PrintModel } from './layout';

export interface Warning {
  id: string;
  message: string;
  blocking: boolean;
}

export const FIELD_LABEL: Record<FieldKey, string> = {
  date: 'التاريخ', payee: 'المستفيد', amountWords1: 'المبلغ بالحروف', amountWords2: 'المبلغ بالحروف',
  amountDigits: 'المبلغ بالأرقام', crossing: 'عبارة التسطير', signatoryName: 'الاسم', memo: 'البيان',
  stubDate: 'تاريخ الكعب', stubPayee: 'مستفيد الكعب', stubAmount: 'مبلغ الكعب',
};

export interface WarningInput {
  model: PrintModel;
  date: string;
  today: string;
  amount: number | null;
  amountLimit?: number;
  number: number | null;
  bookRange?: { from: number; to: number };
  isDuplicateNumber: boolean;
}

export function chequeWarnings(input: WarningInput): Warning[] {
  const warnings: Warning[] = [];
  const { model, date, today, amount, amountLimit, number, bookRange, isDuplicateNumber } = input;

  for (const issue of model.issues) {
    const label = FIELD_LABEL[issue.field];
    if (issue.kind === 'forbidden') {
      warnings.push({ id: `forbidden-${issue.field}`, blocking: true, message: `حقل ${label} داخل منطقة الترميز الممنوعة` });
    } else if (issue.kind === 'missingGlyph') {
      warnings.push({ id: `glyph-${issue.field}`, blocking: true, message: `حقل ${label} فيه رمز مش هيتطبع صح، امسحه` });
    } else if (issue.kind === 'overflow') {
      warnings.push({ id: `overflow-${issue.field}`, blocking: false, message: `${label} أطول من الحقل حتى بأصغر خط` });
    } else {
      warnings.push({ id: `shrunk-${issue.field}`, blocking: false, message: `${label} طويل، فاتصغّر الخط لحجم ${toArabicDigits(issue.sizePt)}` });
    }
  }

  if (date) {
    if (daysBetween(today, date) > 0) {
      warnings.push({ id: 'postdated', blocking: false, message: `شيك مؤجل بتاريخ ${formatDate(date)}` });
    }
    if (date < addMonths(today, -6)) {
      warnings.push({ id: 'stale', blocking: false, message: 'التاريخ أقدم من ٦ شهور' });
    }
  }

  if (amount !== null && amountLimit && amount > amountLimit) {
    warnings.push({ id: 'limit', blocking: false, message: `المبلغ أكبر من الحد المحدد (${formatNumber(amountLimit)})` });
  }

  if (isDuplicateNumber) {
    warnings.push({ id: 'duplicate', blocking: false, message: 'رقم الشيك مستخدم قبل كده في الدفتر ده' });
  }

  if (number !== null && bookRange && (number < bookRange.from || number > bookRange.to)) {
    warnings.push({ id: 'range', blocking: true, message: 'رقم الشيك خارج نطاق الدفتر المختار' });
  }

  return warnings;
}

/** أي نص يقع في الهامش غير القابل للطباعة عند الحافة اللي بتدخل الأول. */
export function marginWarnings(model: PrintModel, matrix: Matrix, leadingMarginMm: number): Warning[] {
  const offending = new Set<FieldKey>();
  for (const text of model.texts) {
    for (const x of [text.x, text.x + text.widthMm]) {
      if (applyMatrix(matrix, x, text.y)[1] < leadingMarginMm) offending.add(text.field);
    }
  }
  return [...offending].map((field) => ({
    id: `margin-${field}`,
    blocking: false,
    message: `حقل ${FIELD_LABEL[field]} داخل هامش الطابعة ومش هيتطبع كامل`,
  }));
}
