import { describe, expect, it } from 'vitest';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { buildPageSetup, mmToPt, ptToMm } from '@/core/geometry';
import { layoutCheque, type ChequeValues } from '@/core/layout';
import { builtinTemplates } from '@/core/templates';
import { createChequePdf } from './chequePdf';
import { createReviewPdf } from './reviewCopy';
import { createCalibrationPdf, createDirectionPdf } from './testPages';
import { createTestShaper } from './test-shaper';
import type { PrinterProfile } from '@/core/types';

const shaper = createTestShaper();
const template = builtinTemplates().find((t) => t.id === 'tpl-ahly-qr')!;
const profile: PrinterProfile = { id: 'p', name: 'p', pageMode: 'a4', rotation: 90, mirrored: false, align: 'center', leadingMarginMm: 5, builtin: true, updatedAt: 0 };
const noCalibration = { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 };
const values: ChequeValues = {
  payee: 'شركة الأمل', amount: 148500, date: '2026-03-14', memo: '', signatoryName: '',
  crossing: { kind: 'none', text: '', drawLines: false }, printStub: false, tafqeetPresetId: 'accounting', amountProtection: 'slash',
};
const model = layoutCheque(template, values, shaper);

const sizeMm = async (bytes: Uint8Array) => {
  const doc = await PDFDocument.load(bytes);
  return { pages: doc.getPageCount(), ...doc.getPage(0).getSize() };
};

describe('ملف الطباعة', () => {
  it('صفحة A4 بدقة أقل من ٠٫١ مم', async () => {
    const size = await sizeMm(await createChequePdf({ model, shaper, setup: buildPageSetup(174, 84, profile) }));
    expect(size.pages).toBe(1);
    expect(Math.abs(ptToMm(size.width) - 210)).toBeLessThan(0.1);
    expect(Math.abs(ptToMm(size.height) - 297)).toBeLessThan(0.1);
  });

  it('صفحة بمقاس الشيك طولية', async () => {
    const size = await sizeMm(await createChequePdf({ model, shaper, setup: buildPageSetup(174, 84, { ...profile, pageMode: 'chequeSize' }) }));
    expect(Math.abs(ptToMm(size.width) - 84)).toBeLessThan(0.1);
    expect(Math.abs(ptToMm(size.height) - 174)).toBeLessThan(0.1);
  });

  it('مفيش صور ولا خلفية في ملف الأصل', async () => {
    const doc = await PDFDocument.load(await createChequePdf({ model, shaper, setup: buildPageSetup(174, 84, profile) }));
    const images = doc.getPage(0).node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    expect(images?.entries().length ?? 0).toBe(0);
  });

  it('الأرقام المرسومة عربية مش لاتينية', () => {
    const digits = model.texts.find((t) => t.field === 'amountDigits')!;
    expect(digits.text).toMatch(/^[٠-٩]+\/-$/);
    const latin = shaper.outline({ ...digits, text: '148500/-' }).commands;
    expect(shaper.outline(digits).commands).not.toEqual(latin);
  });

  it('صفحات المعايرة والاتجاه A4', async () => {
    for (const bytes of [await createCalibrationPdf(template, profile, noCalibration, shaper), await createDirectionPdf(template, profile, noCalibration, shaper)]) {
      const size = await sizeMm(bytes);
      expect(size.width).toBeCloseTo(mmToPt(210), 1);
    }
  });
});

describe('نسخة المراجعة', () => {
  const info = { accountant: 'سارة', preparedDate: '١٤/٠٣/٢٠٢٦' };
  const item = { template, model, chequeNumber: '100' };

  it('كل حروف العلامة المائية مدعومة', async () => {
    const { WATERMARK_TEXT } = await import('./reviewCopy');
    expect(shaper.hasMissingGlyphs({ text: WATERMARK_TEXT, dir: 'rtl', sizePt: 12, bold: true })).toBe(false);
  });

  it('أربعة شيكات في ورقة وخمسة في ورقتين', async () => {
    expect((await sizeMm(await createReviewPdf([item, item, item, item], info, shaper))).pages).toBe(1);
    expect((await sizeMm(await createReviewPdf([item, item, item, item, item], info, shaper))).pages).toBeGreaterThanOrEqual(2);
  });
});
