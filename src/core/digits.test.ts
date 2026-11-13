import { describe, expect, it } from 'vitest';
import { formatMoney, formatNumber, formatPiastersTotal, formatProtectedAmount, parseAmount, toArabicDigits, toLatinDigits, toPiasters } from './digits';
import { addMonths, dateCells, daysBetween, firstWeekdayOfMonth, formatDate, formatDateLong, parseIsoDate } from './date';

describe('تحويل الأرقام', () => {
  it('لاتيني إلى عربي', () => expect(toArabicDigits('0123456789')).toBe('٠١٢٣٤٥٦٧٨٩'));
  it('عربي وفارسي إلى لاتيني', () => expect(toLatinDigits('١٢٣۴۵')).toBe('12345'));
  it('يترك الحروف كما هي', () => expect(toArabicDigits('شيك 12')).toBe('شيك ١٢'));
});

describe('قراءة المبلغ', () => {
  it.each([
    ['148500', 148500],
    ['١٤٨٥٠٠', 148500],
    ['148,500', 148500],
    ['١٤٨٬٥٠٠', 148500],
    ['148500.00', 148500],
    ['١٤٨٥٠٠٫٠٠', 148500],
    [' 12 ', 12],
    ['999999999999', 999999999999],
  ])('%s', (input, value) => {
    expect(parseAmount(input)).toEqual({ ok: true, value, piasters: 0 });
  });

  it.each(['', 'abc', '0', '0.00', '12.345', '١٢٫٣٤٥', '-5', '1000000000000'])('يرفض «%s»', (input) => {
    expect(parseAmount(input).ok).toBe(false);
  });

  it('رسالة القروش الزيادة واضحة', () => {
    expect(parseAmount('12.345')).toEqual({ ok: false, error: 'القروش رقمين بس بعد العلامة' });
  });

  it.each([
    ['١٤٨٥٠٠،٤٥', 148500, 45],
    ['148500.45', 148500, 45],
    ['١٤٨٬٥٠٠٫٤٥', 148500, 45],
    ['3990213.45', 3990213, 45],
    ['12.5', 12, 50],
    ['١٢،٥', 12, 50],
    ['0.50', 0, 50],
    ['12.500', 12, 50],
    ['148,500.05', 148500, 5],
  ])('بالقروش «%s»', (input, value, piasters) => {
    expect(parseAmount(input)).toEqual({ ok: true, value, piasters });
  });

  it('الفاصلة العربية عمرها ما بتتقري فاصل آلاف', () => {
    expect(parseAmount('١٤٨٥٠٠،٤٥')).not.toEqual({ ok: true, value: 14850045, piasters: 0 });
  });
});

describe('التنسيق', () => {
  it('فواصل عربية', () => expect(formatNumber(148500)).toBe('١٤٨٬٥٠٠'));
  it('حماية بالشرطة كالشيك الحقيقي', () => expect(formatProtectedAmount(148500)).toBe('١٤٨٥٠٠/-'));
  it('بالقروش بالفاصلة العربية', () => expect(formatProtectedAmount(148500, 'slash', 'right', 45)).toBe('١٤٨٥٠٠،٤٥'));
  it('قرش واحد برقمين', () => expect(formatProtectedAmount(10, 'slash', 'right', 5)).toBe('١٠،٠٥'));
  it('بالقروش بين علامات', () => expect(formatProtectedAmount(3990213, 'hash', 'right', 45)).toBe('#٣٬٩٩٠٬٢١٣٫٤٥#'));
  it('عرض المبالغ والإجماليات', () => {
    expect(formatMoney(148500, 45)).toBe('١٤٨٬٥٠٠٫٤٥');
    expect(formatMoney(148500)).toBe('١٤٨٬٥٠٠');
    expect(formatPiastersTotal(toPiasters(1, 75) + toPiasters(2, 50))).toBe('٤٫٢٥');
  });
  it('عكس جهة العلامة', () => expect(formatProtectedAmount(148500, 'slash', 'left')).toBe('-/١٤٨٥٠٠'));
  it('حماية بالعلامات', () => {
    expect(formatProtectedAmount(148500, 'hash')).toBe('#١٤٨٬٥٠٠#');
    expect(formatProtectedAmount(148500, 'star')).toBe('**١٤٨٬٥٠٠**');
  });
});

describe('التاريخ', () => {
  it('الصيغة', () => expect(formatDate('2026-03-14')).toBe('١٤/٠٣/٢٠٢٦'));
  it('الصيغة الطويلة', () => expect(formatDateLong('2026-11-09')).toBe('٩ نوفمبر ٢٠٢٦'));
  it('الخانات الثماني بالترتيب', () => {
    expect(dateCells('2026-03-14')).toEqual(['١', '٤', '٠', '٣', '٢', '٠', '٢', '٦']);
  });
  it('يرفض تاريخ غير موجود', () => expect(parseIsoDate('2026-02-30')).toBeNull());
  it('فرق الأيام', () => expect(daysBetween('2026-01-01', '2026-03-01')).toBe(59));
  it('إضافة شهور مع قص آخر الشهر', () => expect(addMonths('2026-08-31', -6)).toBe('2026-02-28'));
  it('أول يوم في الأسبوع يبدأ بالسبت', () => {
    // ١ نوفمبر ٢٠٢٦ يوم أحد
    expect(firstWeekdayOfMonth(2026, 11)).toBe(1);
  });
});
