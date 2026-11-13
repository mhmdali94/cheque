/** الأرقام العربية المشرقية والتحويل منها وإليها. كل التنسيق بلغة مثبتة، لا يعتمد على لغة الجهاز. */

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export const MAX_AMOUNT = 999_999_999_999;

const numberFormatter = new Intl.NumberFormat('ar-EG', {
  numberingSystem: 'arab',
  maximumFractionDigits: 0,
});

/** يحوّل أي أرقام لاتينية في النص إلى عربية مشرقية. */
export function toArabicDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => ARABIC_DIGITS[Number(d)]);
}

/** يحوّل الأرقام العربية والفارسية في النص إلى لاتينية للمعالجة الداخلية. */
export function toLatinDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (d) => {
    const arabic = ARABIC_DIGITS.indexOf(d);
    return String(arabic >= 0 ? arabic : PERSIAN_DIGITS.indexOf(d));
  });
}

/** رقم بفواصل الآلاف العربية: ١٤٨٬٥٠٠ */
export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export type AmountParseResult =
  | { ok: true; value: number; piasters: number }
  | { ok: false; error: string };

/**
 * يقرأ المبلغ كما كتبه المحاسب، بأرقام عربية أو لاتينية وبفواصل أو بدونها.
 * الجنيهات والقروش بيتخزنوا كأعداد صحيحة منفصلة عشان مفيش أخطاء كسور.
 */
export function parseAmount(input: string): AmountParseResult {
  // الفاصلة العربية «،» والعلامة «٫» والنقطة بيفصلوا القروش، و«,» و«٬» فواصل آلاف.
  const compact = toLatinDigits(input).replace(/[\s,٬]/g, '');
  if (compact === '') return { ok: false, error: 'اكتب المبلغ' };

  const match = /^(\d+)(?:[.٫،](\d*))?$/.exec(compact);
  if (!match) return { ok: false, error: 'المبلغ لازم يكون أرقام فقط' };
  const fraction = match[2] ?? '';
  if (/[1-9]/.test(fraction.slice(2))) {
    return { ok: false, error: 'القروش رقمين بس بعد العلامة' };
  }

  const value = Number(match[1]);
  const piasters = Number(fraction.slice(0, 2).padEnd(2, '0'));
  if (value === 0 && piasters === 0) return { ok: false, error: 'المبلغ لازم يكون أكبر من صفر' };
  if (value > MAX_AMOUNT) return { ok: false, error: 'المبلغ أكبر من الحد المسموح' };
  return { ok: true, value, piasters };
}

const moneyFormatter = new Intl.NumberFormat('ar-EG', {
  numberingSystem: 'arab',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** مبلغ للعرض: ١٤٨٬٥٠٠ أو ١٤٨٬٥٠٠٫٤٥ لو فيه قروش. */
export function formatMoney(pounds: number, piasters = 0): string {
  return piasters > 0 ? moneyFormatter.format(pounds + piasters / 100) : formatNumber(pounds);
}

/** إجمالي متخزن بالقروش. */
export const formatPiastersTotal = (total: number) => formatMoney(Math.floor(total / 100), total % 100);

/** المبلغ كله بالقروش، للجمع من غير أخطاء كسور. */
export const toPiasters = (pounds: number | null, piasters = 0) => (pounds ?? 0) * 100 + piasters;

export type AmountProtection = 'slash' | 'hash' | 'star';
export type AmountSignSide = 'right' | 'left';

/**
 * المبلغ بالأرقام بصيغة الحماية، بترتيب العرض من الشمال لليمين.
 * الحقل يُرسم دائماً من الشمال لليمين، فخوارزمية الاتجاه لا تعكس العلامة.
 */
export function formatProtectedAmount(
  value: number,
  protection: AmountProtection = 'slash',
  signSide: AmountSignSide = 'right',
  piasters = 0,
): string {
  switch (protection) {
    case 'slash': {
      // زي الشيكات: ١٤٨٥٠٠/- من غير قروش، و١٤٨٥٠٠،٤٥ بالقروش.
      const digits = toArabicDigits(value);
      if (piasters > 0) {
        const tail = toArabicDigits(String(piasters).padStart(2, '0'));
        return signSide === 'right' ? `${digits}،${tail}` : `${tail}،${digits}`;
      }
      return signSide === 'right' ? `${digits}/-` : `-/${digits}`;
    }
    case 'hash':
      return `#${formatMoney(value, piasters)}#`;
    case 'star':
      return `**${formatMoney(value, piasters)}**`;
  }
}
