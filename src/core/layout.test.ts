import { describe, expect, it } from 'vitest';
import { createTestShaper } from '@/print/test-shaper';
import { buildPageSetup } from './geometry';
import { layoutCheque, tokenizeWords, type ChequeValues } from './layout';
import { builtinTemplates } from './templates';
import type { ChequeTemplate } from './types';
import { chequeWarnings, marginWarnings } from './warnings';

const shaper = createTestShaper();
const templates = builtinTemplates();
const ahly = templates.find((t) => t.id === 'tpl-ahly-qr')!;
const alex = templates.find((t) => t.id === 'tpl-alex-1')!;

const values: ChequeValues = {
  payee: 'شركة النور للتجارة', amount: 148500, date: '2026-03-14', memo: '', signatoryName: '',
  crossing: { kind: 'none', text: '', drawLines: false }, printStub: false,
  tafqeetPresetId: 'accounting', amountProtection: 'slash',
};

const texts = (t: ChequeTemplate, v: Partial<ChequeValues> = {}) => layoutCheque(t, { ...values, ...v }, shaper);

describe('القوالب الجاهزة', () => {
  it('مقاسات البنكين', () => {
    expect([ahly.lengthMm, ahly.widthMm]).toEqual([174, 84]);
    expect([alex.lengthMm, alex.widthMm]).toEqual([175, 84]);
  });

  it.each(templates.map((t) => [t.name, t] as const))('%s: الحقول داخل الشيك وفوق منطقة الترميز', (_name, t) => {
    for (const f of [t.date, t.payee, t.amountWords.line1, t.amountWords.line2, t.amountDigits, t.signatoryName]) {
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.x + f.w).toBeLessThanOrEqual(t.lengthMm);
      expect(f.y + f.h).toBeLessThanOrEqual(t.micrLineY);
    }
  });

  it.each(templates.map((t) => [t.name, t] as const))('%s: التفقيط يبدأ على بعد ٦٥ مم من اليمين', (_name, t) => {
    const { x, w } = t.amountWords.line1;
    expect(t.lengthMm - (x + w)).toBeCloseTo(65, 1);
  });

  it.each(templates.filter((t) => t.bankName === ahly.bankName).map((t) => [t.name, t] as const))('%s: مربع التاريخ بالمقاس الفعلي', (_name, t) => {
    expect(t.lengthMm - (t.date.x + t.date.w)).toBeCloseTo(12.5, 2);
    expect(t.date.w).toBe(32.5);
    expect(t.date.h).toBe(6);
    expect(t.date.cellPitch).toBeCloseTo(32.5 / 8, 6);
    expect(t.date.y + t.date.h * 0.74).toBeCloseTo(8.55, 1);
  });

  it('خانات تاريخ الأهلي متوسطة في المربع', () => {
    const digits = texts(ahly).texts.filter((t) => t.field === 'date');
    const firstCenter = digits[0].x + digits[0].widthMm / 2;
    const lastCenter = digits[7].x + digits[7].widthMm / 2;
    expect(firstCenter).toBeCloseTo(ahly.date.x + 32.5 / 16, 2);
    expect(lastCenter).toBeCloseTo(ahly.date.x + 32.5 - 32.5 / 16, 2);
  });

  it.each(templates.filter((t) => t.bankName === ahly.bankName).map((t) => [t.name, t] as const))('%s: المستفيد على بعد ٤ سم ونازل نص سم', (_name, t) => {
    expect(t.lengthMm - (t.payee.x + t.payee.w)).toBeCloseTo(40, 1);
    expect(t.payee.y).toBeCloseTo(84 * 0.27 - 5.5 + 5, 1);
    expect(t.payee.y + t.payee.h).toBeLessThanOrEqual(t.micrLineY);
  });

  it.each(templates.filter((t) => t.bankName === ahly.bankName).map((t) => [t.name, t] as const))('%s: سطر التفقيط التاني بعيد عن خانة المبلغ', (_name, t) => {
    const { x, w } = t.amountWords.line2;
    expect(t.lengthMm - (x + w)).toBeCloseTo(50, 1);
    expect(x + w).toBeLessThan(t.amountDigits.x);
    expect(t.amountDigits.y).toBeCloseTo(84 * 0.45 - 5.5 + 2.8, 1);
    expect(t.amountDigits.fontSizePt).toBe(14);
    expect(t.signatoryName.y).toBeCloseTo(84 * 0.63 - 5.5, 1);
    expect(t.amountWords.line1.y).toBeCloseTo(84 * 0.4 - 5.5 + 3, 1);
    expect(t.amountWords.line2.y).toBeCloseTo(84 * 0.51 - 5.5 + 3, 1);
    // المربعان متلامسان، والمهم إن سطور الكتابة نفسها متباعدة بما يكفي الحروف
    expect(t.signatoryName.y + t.signatoryName.h * 0.74 - (t.amountWords.line2.y + t.amountWords.line2.h * 0.74)).toBeGreaterThan(5);
    expect(t.signatoryName.y + t.signatoryName.h).toBeLessThanOrEqual(t.signatureBox.y);
    expect(t.signatoryName.y).toBeGreaterThanOrEqual(t.amountDigits.y + t.amountDigits.h);
  });

  it('المبلغ بالخط الأكبر يفضل داخل خانته', () => {
    const digits = texts(ahly).texts.find((t) => t.field === 'amountDigits')!;
    expect(digits.sizePt).toBe(14);
    expect(digits.widthMm).toBeLessThanOrEqual(ahly.amountDigits.w);
  });

  it('خط السطر التاني ما يوصلش لخانة المبلغ حتى لو السطر فاضي', () => {
    const fill = texts(ahly, { amount: 900000 }).rules.find((r) => r.field === 'amountWords2')!;
    expect(ahly.lengthMm - fill.x2).toBeCloseTo(50, 0);
    expect(fill.x2).toBeLessThan(ahly.amountDigits.x);
  });

  it('مبالغ الإسكندرية ما اتغيرتش', () => {
    const { x, w } = alex.amountWords.line2;
    expect(alex.lengthMm - (x + w)).toBeCloseTo(175 * 0.2, 1);
    expect(alex.amountDigits.y).toBeCloseTo(84 * 0.42 - 5.5, 1);
    expect(alex.amountDigits.fontSizePt).toBe(12);
    expect(alex.signatoryName.y).toBeCloseTo(84 * 0.54 - 5.5, 1);
    expect(alex.amountWords.line1.y).toBeCloseTo(84 * 0.42 - 5.5, 1);
    expect(alex.amountWords.line2.y).toBeCloseTo(84 * 0.51 - 5.5, 1);
  });

  it('مستفيد الإسكندرية ما اتغيرش', () => {
    expect(alex.lengthMm - (alex.payee.x + alex.payee.w)).toBeCloseTo(175 * 0.06, 1);
  });

  it('تاريخ الإسكندرية ما اتغيرش', () => {
    expect(alex.date.w).toBeCloseTo(175 * 0.17, 2);
    expect(alex.lengthMm - (alex.date.x + alex.date.w)).toBeCloseTo(175 * 0.09, 2);
    expect(alex.date.h).toBe(6.5);
  });

  it('الخانات الثماني داخل مربع التاريخ', () => {
    const lastCenter = ahly.date.firstCellCenterX + 7 * ahly.date.cellPitch;
    expect(ahly.date.firstCellCenterX).toBeGreaterThan(ahly.date.x);
    expect(lastCenter).toBeLessThan(ahly.date.x + ahly.date.w);
  });
});

describe('تخطيط الشيك', () => {
  it('المبلغ بالأرقام بالشكل المطلوب', () => {
    expect(texts(ahly).texts.find((t) => t.field === 'amountDigits')?.text).toBe('١٤٨٥٠٠/-');
  });

  it('خانات التاريخ: اليوم على الشمال', () => {
    const digits = texts(ahly).texts.filter((t) => t.field === 'date');
    expect(digits.map((d) => d.text)).toEqual(['١', '٤', '٠', '٣', '٢', '٠', '٢', '٦']);
    expect(digits[0].x).toBeLessThan(digits[7].x);
  });

  it('خانات التاريخ معكوسة لو القالب اختار كده', () => {
    const reversed = { ...ahly, date: { ...ahly.date, cellOrder: 'rtl' as const } };
    const digits = texts(reversed).texts.filter((t) => t.field === 'date');
    expect(digits[0].x).toBeGreaterThan(digits[7].x);
  });

  it('التفقيط لا يضيع منه كلام بين السطرين', () => {
    const { texts: items } = texts(ahly, { amount: 999_999_999_999 });
    const line1 = items.find((t) => t.field === 'amountWords1')!.text;
    const line2 = items.find((t) => t.field === 'amountWords2')!.text;
    expect(`${line1} ${line2}`).toContain('لا غير');
    expect(`${line1} ${line2}`.startsWith('فقط تسعمائة')).toBe(true);
    expect(line2.endsWith('لا غير')).toBe(true);
  });

  it('«لا غير» و«جنيه مصري» لا يتفصلوا', () => {
    expect(tokenizeWords('فقط مائة جنيه مصري لا غير')).toEqual(['فقط', 'مائة', 'جنيه مصري', 'لا غير']);
  });

  it('ملء باقي السطر بخط، والسطر التاني كامل لو فاضي', () => {
    const { rules, texts: items } = texts(ahly, { amount: 5 });
    const first = items.find((t) => t.field === 'amountWords1')!;
    const fill1 = rules.find((r) => r.field === 'amountWords1')!;
    expect(fill1.x2).toBeLessThan(first.x);
    const fill2 = rules.find((r) => r.field === 'amountWords2')!;
    expect(fill2.x2 - fill2.x1).toBeCloseTo(ahly.amountWords.line2.w, 3);
    expect(items.some((t) => t.field === 'amountWords2')).toBe(false);
  });

  it('المحاذاة لليمين تنتهي عند حافة الحقل', () => {
    const payee = texts(ahly).texts.find((t) => t.field === 'payee')!;
    expect(payee.x + payee.widthMm).toBeCloseTo(ahly.payee.x + ahly.payee.w, 6);
  });

  it('اسم طويل يتصغّر خطه', () => {
    const { issues, texts: items } = texts(ahly, { payee: 'شركة النور للتجارة والمقاولات العامة والتوريدات الهندسية والكهربائية ش.م.م' });
    const payee = items.find((t) => t.field === 'payee')!;
    expect(payee.sizePt).toBeLessThan(ahly.payee.fontSizePt);
    expect(issues.some((i) => i.field === 'payee')).toBe(true);
  });

  it('خانة الاسم لا تُطبع لو فاضية', () => {
    expect(texts(ahly).texts.some((t) => t.field === 'signatoryName')).toBe(false);
    expect(texts(ahly, { signatoryName: 'أحمد علي' }).texts.some((t) => t.field === 'signatoryName')).toBe(true);
  });

  it('التسطير بزاوية القالب، والخطوط الإضافية بالاختيار فقط', () => {
    const plain = texts(ahly, { crossing: { kind: 'firstBeneficiary', text: '', drawLines: false } });
    const item = plain.texts.find((t) => t.field === 'crossing')!;
    expect(item.text).toBe('يصرف للمستفيد الأول');
    expect(item.angleDeg).toBe(ahly.crossing.angleDeg);
    expect(plain.rules.some((r) => r.field === 'crossing')).toBe(false);
    const drawn = texts(ahly, { crossing: { kind: 'none', text: '', drawLines: true } });
    expect(drawn.rules.filter((r) => r.field === 'crossing')).toHaveLength(2);
  });

  it('الحقل داخل منطقة الترميز يتسجل كمشكلة', () => {
    const moved = { ...ahly, payee: { ...ahly.payee, y: ahly.micrLineY - 1 } };
    expect(texts(moved).issues).toContainEqual({ kind: 'forbidden', field: 'payee' });
  });

  it('الرمز غير المدعوم يتسجل كمشكلة', () => {
    expect(texts(ahly, { payee: 'شركة 😀' }).issues).toContainEqual({ kind: 'missingGlyph', field: 'payee' });
  });

  it('المسودة بدون مبلغ', () => {
    expect(texts(ahly, { amount: null }).texts.some((t) => t.field === 'amountDigits')).toBe(false);
  });
});

describe('التحذيرات', () => {
  const model = texts(ahly);
  const base = { model, date: '2026-03-14', today: '2026-03-14', amount: 100, number: 5, isDuplicateNumber: false };
  const ids = (input: Parameters<typeof chequeWarnings>[0]) => chequeWarnings(input).map((w) => w.id);

  it('شيك عادي بدون تحذيرات', () => expect(ids(base)).toEqual([]));
  it('مؤجل', () => expect(ids({ ...base, date: '2026-04-01' })).toEqual(['postdated']));
  it('أقدم من ٦ شهور', () => expect(ids({ ...base, date: '2025-09-01' })).toEqual(['stale']));
  it('فوق الحد', () => expect(ids({ ...base, amountLimit: 50 })).toEqual(['limit']));
  it('مكرر', () => expect(ids({ ...base, isDuplicateNumber: true })).toEqual(['duplicate']));
  it('خارج نطاق الدفتر يحتاج تأكيد', () => {
    const [warning] = chequeWarnings({ ...base, bookRange: { from: 10, to: 20 } });
    expect(warning).toMatchObject({ id: 'range', blocking: true });
  });

  it('القوالب الجاهزة خارج هامش الطابعة', () => {
    const { matrix } = buildPageSetup(174, 84, { pageMode: 'a4', rotation: 90, mirrored: false, align: 'center' });
    expect(marginWarnings(model, matrix, 5)).toEqual([]);
  });

  it('حقل عند الحافة الشمال يدخل الهامش', () => {
    const moved = { ...ahly, payee: { ...ahly.payee, x: 0, w: 40, align: 'left' as const } };
    const { matrix } = buildPageSetup(174, 84, { pageMode: 'a4', rotation: 90, mirrored: false, align: 'center' });
    expect(marginWarnings(texts(moved), matrix, 5).map((w) => w.id)).toEqual(['margin-payee']);
  });
});
