import { describe, expect, it } from 'vitest';
import { A4, applyMatrix, buildPageSetup, correctedScale, mmToPt, mmToPx, ptToMm, pxToMm, rotationAround } from './geometry';
import type { PrinterProfile } from './types';
import { splitBidiRuns } from './bidi';

const toshiba: Pick<PrinterProfile, 'pageMode' | 'rotation' | 'mirrored' | 'align'> = {
  pageMode: 'a4', rotation: 90, mirrored: false, align: 'center',
};

const expectPoint = (actual: [number, number], x: number, y: number) => {
  expect(actual[0]).toBeCloseTo(x, 6);
  expect(actual[1]).toBeCloseTo(y, 6);
};

describe('تحويل الوحدات', () => {
  it('مليمتر ونقاط', () => {
    expect(mmToPt(25.4)).toBeCloseTo(72, 8);
    expect(ptToMm(72)).toBeCloseTo(25.4, 8);
    expect(ptToMm(mmToPt(84))).toBeCloseTo(84, 8);
  });
  it('مليمتر وبكسل', () => {
    expect(mmToPx(25.4, 600)).toBeCloseTo(600, 8);
    expect(pxToMm(600, 600)).toBeCloseTo(25.4, 8);
  });
  it('A4 بالنقاط', () => {
    expect(mmToPt(A4.widthMm)).toBeCloseTo(595.28, 2);
    expect(mmToPt(A4.heightMm)).toBeCloseTo(841.89, 2);
  });
});

describe('الشيك على A4 بعد التدوير والتوسيط', () => {
  it('الإسكندرية من ٦٣ لـ ١٤٧ مم أفقياً ومن ٠ لـ ١٧٥ رأسياً', () => {
    const { matrix, pageWidthMm, pageHeightMm } = buildPageSetup(175, 84, toshiba);
    expect([pageWidthMm, pageHeightMm]).toEqual([210, 297]);
    expectPoint(applyMatrix(matrix, 0, 0), 147, 0);
    expectPoint(applyMatrix(matrix, 175, 84), 63, 175);
  });

  it('الأهلي ينتهي عند ١٧٤ مم', () => {
    expectPoint(applyMatrix(buildPageSetup(174, 84, toshiba).matrix, 174, 0), 147, 174);
  });

  it('المعادلة العامة X = (٢١٠ + ع) ÷ ٢ − ص و Y = س', () => {
    const { matrix } = buildPageSetup(174, 84, toshiba);
    for (const [s, p] of [[10, 20], [100, 50], [37.5, 12.25]]) {
      expectPoint(applyMatrix(matrix, s, p), (210 + 84) / 2 - p, s);
    }
  });

  it('اتجاه القراءة من يمين الشيك لشماله يصعد في الصفحة', () => {
    const { matrix } = buildPageSetup(174, 84, toshiba);
    const right = applyMatrix(matrix, 150, 40);
    const left = applyMatrix(matrix, 50, 40);
    expect(left[1]).toBeLessThan(right[1]);
    expect(left[0]).toBeCloseTo(right[0], 6);
  });
});

describe('الأوضاع والتصحيحات', () => {
  it('صفحة بمقاس الشيك', () => {
    const setup = buildPageSetup(174, 84, { ...toshiba, pageMode: 'chequeSize' });
    expect([setup.pageWidthMm, setup.pageHeightMm]).toEqual([84, 174]);
    expectPoint(applyMatrix(setup.matrix, 0, 0), 84, 0);
    expectPoint(applyMatrix(setup.matrix, 174, 84), 0, 174);
  });

  it('تدوير ٢٧٠ يصحح المقلوب', () => {
    const setup = buildPageSetup(174, 84, { ...toshiba, rotation: 270 });
    expectPoint(applyMatrix(setup.matrix, 0, 0), 63, 174);
    expectPoint(applyMatrix(setup.matrix, 174, 84), 147, 0);
  });

  it('القلب الأفقي داخل منطقة الشيك', () => {
    const setup = buildPageSetup(174, 84, { ...toshiba, mirrored: true });
    expectPoint(applyMatrix(setup.matrix, 0, 0), 63, 0);
  });

  it('المحاذاة يمين وشمال', () => {
    expectPoint(applyMatrix(buildPageSetup(174, 84, { ...toshiba, align: 'right' }).matrix, 0, 0), 210, 0);
    expectPoint(applyMatrix(buildPageSetup(174, 84, { ...toshiba, align: 'left' }).matrix, 0, 0), 84, 0);
  });

  it('الإزاحة بمحاور الشيك', () => {
    const calibration = { offsetX: 2, offsetY: -1, scaleX: 1, scaleY: 1 };
    const { matrix } = buildPageSetup(174, 84, toshiba, calibration);
    expectPoint(applyMatrix(matrix, 10, 20), 147 - 19, 12);
  });

  it('المقياس يطبق قبل الإزاحة', () => {
    const calibration = { offsetX: 1, offsetY: 0, scaleX: 1.02, scaleY: 1 };
    expectPoint(applyMatrix(buildPageSetup(174, 84, toshiba, calibration).matrix, 100, 0), 147, 103);
  });

  it('حساب التصحيح من القياس', () => {
    expect(correctedScale(1, 100, 98)).toBeCloseTo(1.020408, 5);
    expect(correctedScale(1.02, 100, 100)).toBeCloseTo(1.02, 8);
  });

  it('الدوران حول نقطة يثبتها', () => {
    expectPoint(applyMatrix(rotationAround(37, 5, 9), 5, 9), 5, 9);
    expectPoint(applyMatrix(rotationAround(90, 0, 0), 1, 0), 0, 1);
  });
});

describe('الاتجاهات', () => {
  it('نص عربي بجزء واحد', () => {
    expect(splitBidiRuns('شركة النور', 'rtl')).toEqual([{ text: 'شركة النور', dir: 'rtl' }]);
  });
  it('الأرقام لا تنعكس داخل نص عربي', () => {
    expect(splitBidiRuns('فاتورة ١٢٣ شهر', 'rtl')).toEqual([
      { text: ' شهر', dir: 'rtl' },
      { text: '١٢٣', dir: 'ltr' },
      { text: 'فاتورة ', dir: 'rtl' },
    ]);
  });
  it('التاريخ جزء واحد', () => {
    expect(splitBidiRuns('١٤/٠٣/٢٠٢٦', 'rtl')).toEqual([{ text: '١٤/٠٣/٢٠٢٦', dir: 'ltr' }]);
  });
  it('علامة الحماية في اتجاه شمال ليمين', () => {
    expect(splitBidiRuns('١٤٨٥٠٠/-', 'ltr')).toEqual([{ text: '١٤٨٥٠٠/-', dir: 'ltr' }]);
  });
  it('نص لاتيني داخل عربي', () => {
    expect(splitBidiRuns('شركة ABC', 'rtl')).toEqual([
      { text: 'ABC', dir: 'ltr' },
      { text: 'شركة ', dir: 'rtl' },
    ]);
  });
});
