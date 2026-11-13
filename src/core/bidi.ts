/** تقسيم مبسّط للاتجاهات: الحروف العربية من اليمين، والأرقام واللاتيني من الشمال. */

export type TextDirection = 'rtl' | 'ltr';

export interface BidiRun {
  text: string;
  dir: TextDirection;
}

type CharClass = 'R' | 'L' | 'N';

const DIGIT = /[0-9٠-٩۰-۹]/;
const STRONG_LTR = /[A-Za-z]/;
const STRONG_RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const NUMBER_SEPARATOR = /[/.,:٫٬،-]/;

function classify(chars: string[]): CharClass[] {
  const classes = chars.map<CharClass>((c) => {
    if (DIGIT.test(c) || STRONG_LTR.test(c)) return 'L';
    return STRONG_RTL.test(c) ? 'R' : 'N';
  });
  // الفاصل بين رقمين جزء من العدد، فلا ينعكس ترتيب ١٢/٠٥.
  chars.forEach((c, i) => {
    if (NUMBER_SEPARATOR.test(c) && DIGIT.test(chars[i - 1] ?? '') && DIGIT.test(chars[i + 1] ?? '')) {
      classes[i] = 'L';
    }
  });
  return classes;
}

function resolveNeutrals(classes: CharClass[], base: TextDirection): TextDirection[] {
  const baseClass: CharClass = base === 'rtl' ? 'R' : 'L';
  const resolved = [...classes];
  for (let i = 0; i < resolved.length; i++) {
    if (resolved[i] !== 'N') continue;
    let end = i;
    while (end < resolved.length && resolved[end] === 'N') end++;
    const before = resolved[i - 1];
    const after = resolved[end];
    const value = before && before === after ? before : baseClass;
    resolved.fill(value, i, end);
    i = end - 1;
  }
  return resolved.map((c) => (c === 'R' ? 'rtl' : 'ltr'));
}

/** الأجزاء بترتيب العرض من الشمال لليمين. */
export function splitBidiRuns(text: string, base: TextDirection): BidiRun[] {
  const chars = [...text];
  if (chars.length === 0) return [];
  const directions = resolveNeutrals(classify(chars), base);

  const runs: BidiRun[] = [];
  chars.forEach((char, i) => {
    const last = runs[runs.length - 1];
    if (last && last.dir === directions[i]) last.text += char;
    else runs.push({ text: char, dir: directions[i] });
  });
  return base === 'rtl' ? runs.reverse() : runs;
}
