/** التواريخ تُخزّن كنص YYYY-MM-DD حتى لا تتأثر بالمنطقة الزمنية. */
import { toArabicDigits } from './digits';

export const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
] as const;

/** من السبت للجمعة، زي النتيجة المصرية. */
export const ARABIC_WEEKDAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'] as const;

const dateTimeFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-arab', {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: true,
});

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

export function toIsoDate(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function todayIso(now: Date = new Date()): string {
  return toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function parseIsoDate(iso: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return valid ? { year, month, day } : null;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** ترتيب أول يوم في الشهر داخل أسبوع يبدأ بالسبت (٠ = سبت). */
export function firstWeekdayOfMonth(year: number, month: number): number {
  return (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 1) % 7;
}

/** ١٤/٠٣/٢٠٢٦ */
export function formatDate(iso: string): string {
  const parsed = parseIsoDate(iso);
  if (!parsed) return '';
  return toArabicDigits(`${pad(parsed.day)}/${pad(parsed.month)}/${pad(parsed.year, 4)}`);
}

export function formatDateLong(iso: string): string {
  const parsed = parseIsoDate(iso);
  if (!parsed) return '';
  return `${toArabicDigits(parsed.day)} ${ARABIC_MONTHS[parsed.month - 1]} ${toArabicDigits(parsed.year)}`;
}

export function formatDateTime(timestamp: number): string {
  return dateTimeFormatter.format(new Date(timestamp));
}

/** أرقام الخانات الثماني بترتيب D D M M Y Y Y Y. */
export function dateCells(iso: string): string[] {
  const parsed = parseIsoDate(iso);
  if (!parsed) return [];
  return [...toArabicDigits(`${pad(parsed.day)}${pad(parsed.month)}${pad(parsed.year, 4)}`)];
}

/** عدد الأيام من a إلى b. */
export function daysBetween(a: string, b: string): number {
  const toUtc = (iso: string) => {
    const p = parseIsoDate(iso);
    return p ? Date.UTC(p.year, p.month - 1, p.day) : NaN;
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/** نفس اليوم بعد عدد شهور، مع قصّه لآخر الشهر عند الحاجة. */
export function addMonths(iso: string, months: number): string {
  const parsed = parseIsoDate(iso);
  if (!parsed) return iso;
  const index = parsed.year * 12 + parsed.month - 1 + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return toIsoDate(year, month, Math.min(parsed.day, daysInMonth(year, month)));
}
