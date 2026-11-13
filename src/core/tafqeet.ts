/**
 * التفقيط العربي للجنيه الصحيح.
 *
 * الجنيه والألف والمليون والمليار كلها مذكرة، فالأعداد ٣–١٠ تأتي بالتاء.
 * التمييز يتحدد بآخر رقمين من العدد.
 * - أسلوب accounting: مطابقة العدد بدون تنوين («ألف»، «جنيه مصري» بعد ١١–٩٩).
 * - أسلوب fusha: تنوين النصب بعد ١١–٩٩ («ألفاً»، «جنيهاً مصرياً»).
 */
import { MAX_AMOUNT } from './digits';

export type TafqeetStyle = 'accounting' | 'fusha';

const ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
const TEENS = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const HUNDREDS = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

interface ScaleWords {
  one: string;
  two: string;
  few: string;
  accusative: string;
}

const SCALES: ScaleWords[] = [
  { one: 'مليار', two: 'ملياران', few: 'مليارات', accusative: 'ملياراً' },
  { one: 'مليون', two: 'مليونان', few: 'ملايين', accusative: 'مليوناً' },
  { one: 'ألف', two: 'ألفان', few: 'آلاف', accusative: 'ألفاً' },
];

/** عدد من ١ إلى ٩٩٩ بالحروف. */
function groupToWords(value: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  if (hundreds) parts.push(HUNDREDS[hundreds]);
  if (rest >= 10 && rest < 20) {
    parts.push(TEENS[rest - 10]);
  } else if (rest > 0) {
    const ones = rest % 10;
    const tens = Math.floor(rest / 10);
    if (ones) parts.push(ONES[ones]);
    if (tens) parts.push(TENS[tens]);
  }
  return parts.join(' و');
}

/** حذف نون المثنى عند الإضافة: مائتان ← مائتا. */
const dropDualNoon = (word: string) => word.slice(0, -1);

/**
 * المرتبة مع عددها. في الفصحى، لو لا يتبعها عطف فهي مضافة للجنيه مباشرة،
 * فيسقط التنوين ونون المثنى: «أحد عشر ألف جنيه»، «ألفا جنيه».
 */
function scaleToWords(count: number, scale: ScaleWords, style: TafqeetStyle, followed: boolean): string {
  const fusha = style === 'fusha';
  if (count === 1) return scale.one;
  if (count === 2) return fusha && !followed ? dropDualNoon(scale.two) : scale.two;
  const lastTwo = count % 100;
  let noun = scale.one;
  if (lastTwo >= 3 && lastTwo <= 10) noun = scale.few;
  else if (lastTwo >= 11 && fusha && followed) noun = scale.accusative;
  const countWords = fusha && count === 200 ? dropDualNoon(HUNDREDS[2]) : groupToWords(count);
  return `${countWords} ${noun}`;
}

function assertAmount(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_AMOUNT) {
    throw new RangeError('المبلغ خارج النطاق المسموح');
  }
}

/** العدد بالحروف فقط، بدون العملة. */
export function numberToWords(value: number, style: TafqeetStyle = 'accounting'): string {
  assertAmount(value);
  const parts: string[] = [];
  let divisor = 1_000_000_000;
  let remaining = value;
  for (const scale of SCALES) {
    const count = Math.floor(remaining / divisor);
    remaining %= divisor;
    if (count) parts.push(scaleToWords(count, scale, style, remaining > 0));
    divisor /= 1000;
  }
  if (remaining) {
    parts.push(style === 'fusha' && remaining === 200 ? dropDualNoon(HUNDREDS[2]) : groupToWords(remaining));
  }
  return parts.join(' و');
}

/** تمييز الجنيه حسب العدد، بصفة «مصري» أو بدونها. */
export function currencyWords(value: number, style: TafqeetStyle, withAdjective = true): string {
  assertAmount(value);
  const lastTwo = value % 100;
  const pick = (noun: string, adjective: string) => (withAdjective ? `${noun} ${adjective}` : noun);
  if (lastTwo >= 3 && lastTwo <= 10) return pick('جنيهات', 'مصرية');
  if (lastTwo >= 11 && style === 'fusha') return pick('جنيهاً', 'مصرياً');
  return pick('جنيه', 'مصري');
}

export interface TafqeetPreset {
  id: string;
  name: string;
  pattern: string;
  style: TafqeetStyle;
  withAdjective: boolean;
}

export const TAFQEET_PRESETS: TafqeetPreset[] = [
  { id: 'accounting', name: 'الصيغة المعتادة', pattern: 'فقط {المبلغ} {العملة} لا غير', style: 'accounting', withAdjective: true },
  { id: 'fusha', name: 'الفصحى الكاملة', pattern: 'فقط {المبلغ} {العملة} لا غير', style: 'fusha', withAdjective: true },
  { id: 'qadruhu', name: 'فقط وقدره', pattern: 'فقط وقدره {المبلغ} {العملة} لا غير', style: 'accounting', withAdjective: false },
  { id: 'mablagh', name: 'مبلغ فقط', pattern: 'مبلغ {المبلغ} {العملة} فقط لا غير', style: 'accounting', withAdjective: true },
];

export const CUSTOM_PRESET_ID = 'custom';

export interface TafqeetOptions {
  pattern: string;
  style: TafqeetStyle;
  withAdjective: boolean;
}

export function resolveTafqeetOptions(presetId: string, customPattern?: string): TafqeetOptions {
  if (presetId === CUSTOM_PRESET_ID && customPattern) {
    return { pattern: customPattern, style: 'accounting', withAdjective: true };
  }
  const preset = TAFQEET_PRESETS.find((p) => p.id === presetId) ?? TAFQEET_PRESETS[0];
  return { pattern: preset.pattern, style: preset.style, withAdjective: preset.withAdjective };
}

/**
 * يملأ الصيغة بالمبلغ. الجنيه الواحد والجنيهان لهما تركيب خاص:
 * العدد لا يسبق المعدود، فتُدمج الكلمتان في موضع {العملة}.
 * لو الصيغة المخصصة بدون {العملة} يُكتب العدد حرفياً لأن المحاسب كتب الوحدة بنفسه.
 */
/** القروش بالحروف مع تمييزها، بنفس قواعد الجنيه (القرش مذكر). */
function piastersToWords(piasters: number, style: TafqeetStyle): string {
  if (piasters === 1) return 'قرش واحد';
  if (piasters === 2) return 'قرشان';
  let noun = 'قرش';
  if (piasters >= 3 && piasters <= 10) noun = 'قروش';
  else if (piasters >= 11 && style === 'fusha') noun = 'قرشاً';
  return `${groupToWords(piasters)} ${noun}`;
}

/** مكان القروش في الصيغة: بعد العملة، أو قبل «لا غير»، أو في الآخر. */
function withPiastersSlot(pattern: string): string {
  if (pattern.includes('{القروش}')) return pattern;
  if (pattern.includes('{العملة}')) return pattern.replace('{العملة}', '{العملة}{القروش}');
  const index = pattern.lastIndexOf('لا غير');
  return index >= 0 ? `${pattern.slice(0, index)}{القروش} ${pattern.slice(index)}` : `${pattern}{القروش}`;
}

export function tafqeet(value: number, options: TafqeetOptions = resolveTafqeetOptions('accounting'), piasters = 0): string {
  if (!Number.isInteger(piasters) || piasters < 0 || piasters > 99) throw new RangeError('القروش لازم تكون من ٠ لـ ٩٩');
  const { style, withAdjective } = options;
  const pattern = withPiastersSlot(options.pattern);
  const piastersText = piasters > 0 ? `${value > 0 ? ' و' : ''}${piastersToWords(piasters, style)}` : '';

  if (value === 0 && piasters > 0) {
    return pattern
      .replaceAll('{المبلغ}', '').replaceAll('{العملة}', '').replaceAll('{القروش}', piastersText)
      .replace(/\s+/g, ' ').trim();
  }

  assertAmount(value);
  const hasCurrency = pattern.includes('{العملة}');

  let amount = numberToWords(value, style);
  let currency = hasCurrency ? currencyWords(value, style, withAdjective) : '';

  if (hasCurrency && value === 1) {
    amount = '';
    currency = withAdjective ? 'جنيه مصري واحد' : 'جنيه واحد';
  } else if (hasCurrency && value === 2) {
    amount = '';
    currency = withAdjective ? 'جنيهان مصريان' : 'جنيهان';
  }

  return pattern
    .replaceAll('{المبلغ}', amount)
    .replaceAll('{العملة}', currency)
    .replaceAll('{القروش}', piastersText)
    .replace(/\s+/g, ' ')
    .trim();
}
