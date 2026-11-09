import { describe, expect, it } from 'vitest';
import { createTestShaper } from './test-shaper';

const shaper = createTestShaper();
const request = { dir: 'rtl' as const, sizePt: 12, bold: false };

describe('تشكيل النص', () => {
  it('الحروف المتصلة أضيق من المنفصلة', () => {
    const joined = shaper.measure({ ...request, text: 'محمد' });
    const separate = shaper.measure({ ...request, text: 'م ح م د' });
    expect(joined).toBeGreaterThan(0);
    expect(joined).toBeLessThan(separate);
  });

  it('العرض يتناسب مع حجم الخط', () => {
    const small = shaper.measure({ ...request, text: 'شيك', sizePt: 10 });
    const large = shaper.measure({ ...request, text: 'شيك', sizePt: 20 });
    expect(large).toBeCloseTo(small * 2, 6);
  });

  it('المسار مغلق وفوق خط الأساس', () => {
    const { commands, widthMm } = shaper.outline({ ...request, text: '١٢٣', dir: 'ltr' });
    expect(commands.some((c) => c.op === 'Z')).toBe(true);
    expect(widthMm).toBeGreaterThan(0);
    const firstMove = commands.find((c) => c.op === 'M')!;
    expect(firstMove.pts[1]).toBeLessThanOrEqual(0.5);
  });

  it('ترتيب الأرقام في الجزء من الشمال لليمين', () => {
    const one = shaper.outline({ ...request, text: '١', dir: 'ltr' }).widthMm;
    const { commands } = shaper.outline({ ...request, text: '١٨', dir: 'ltr' });
    const moves = commands.filter((c) => c.op === 'M');
    // أول شكل هو الرقم ١ عند بداية السطر، والتاني بعد عرض الرقم الأول
    expect(moves[0].pts[0]).toBeLessThan(one);
    expect(moves[moves.length - 1].pts[0]).toBeGreaterThanOrEqual(one * 0.9);
  });

  it('النص الفاضي', () => {
    expect(shaper.outline({ ...request, text: '' })).toEqual({ commands: [], widthMm: 0 });
  });
});
