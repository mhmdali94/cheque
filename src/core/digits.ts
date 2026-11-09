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
  | { ok: true; value: number }
  | { ok: false; error: string };

/**
 * يقرأ المبلغ كما كتبه المحاسب، بأرقام عربية أو لاتينية وبفواصل أو بدونها.
 * الشيكات بالجنيه الصحيح فقط، فأي كسر غير صفري مرفوض.
 */
export function parseAmount(input: string): AmountParseResult {
  const compact = toLatinDigits(input).replace(/[\s,٬،]/g, '');
  if (compact === '') return { ok: false, error: 'اكتب المبلغ' };

  const match = /^(\d+)(?:[.٫](\d*))?$/.exec(compact);
  if (!match) return { ok: false, error: 'المبلغ لازم يكون أرقام فقط' };
  if (match[2] && /[1-9]/.test(match[2])) {
    return { ok: false, error: 'الشيكات بالجنيه الصحيح، من غير قروش' };
  }

  const value = Number(match[1]);
  if (value < 1) return { ok: false, error: 'المبلغ لازم يكون جنيه واحد على الأقل' };
  if (value > MAX_AMOUNT) return { ok: false, error: 'المبلغ أكبر من الحد المسموح' };
  return { ok: true, value };
}

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
): string {
  switch (protection) {
    case 'slash': {
      const digits = toArabicDigits(value);
      return signSide === 'right' ? `${digits}/-` : `-/${digits}`;
    }
    case 'hash':
      return `#${formatNumber(value)}#`;
    case 'star':
      return `**${formatNumber(value)}**`;
  }
}
