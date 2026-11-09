import { describe, expect, it } from 'vitest';
import { formatNumber, formatProtectedAmount, parseAmount, toArabicDigits, toLatinDigits } from './digits';
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
    expect(parseAmount(input)).toEqual({ ok: true, value });
  });

  it.each(['', 'abc', '0', '12.5', '١٢٫٥', '-5', '1000000000000'])('يرفض «%s»', (input) => {
    expect(parseAmount(input).ok).toBe(false);
  });

  it('رسالة الكسور واضحة', () => {
    expect(parseAmount('12.5')).toEqual({ ok: false, error: 'الشيكات بالجنيه الصحيح، من غير قروش' });
  });
});

describe('التنسيق', () => {
  it('فواصل عربية', () => expect(formatNumber(148500)).toBe('١٤٨٬٥٠٠'));
  it('حماية بالشرطة كالشيك الحقيقي', () => expect(formatProtectedAmount(148500)).toBe('١٤٨٥٠٠/-'));
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
