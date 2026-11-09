import { describe, expect, it } from 'vitest';
import { applyHomography, computeHomography, warpPixels } from './homography';

describe('تصحيح المنظور', () => {
  const from = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }];
  const to = [{ x: 10, y: 20 }, { x: 210, y: 5 }, { x: 230, y: 130 }, { x: 5, y: 110 }];

  it('الزوايا تتطابق', () => {
    const h = computeHomography(from, to);
    from.forEach((p, i) => {
      const mapped = applyHomography(h, p.x, p.y);
      expect(mapped.x).toBeCloseTo(to[i].x, 6);
      expect(mapped.y).toBeCloseTo(to[i].y, 6);
    });
  });

  it('زوايا على خط واحد مرفوضة', () => {
    const line = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }];
    expect(() => computeHomography(from, line)).toThrow();
  });

  it('القص بدون ميل يطابق الأصل', () => {
    const width = 4;
    const height = 4;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) data.set([i, 100, 200, 255], i);
    const corners = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
    expect([...warpPixels({ data, width, height }, corners, 4, 4)]).toEqual([...data]);
  });
});
