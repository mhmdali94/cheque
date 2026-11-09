/** تصحيح منظور صورة الشيك من أربع زوايا. */

export interface Point {
  x: number;
  y: number;
}

export type Homography = readonly [number, number, number, number, number, number, number, number];

function solve(matrix: number[][], vector: number[]): number[] {
  const n = vector.length;
  const rows = matrix.map((row, i) => [...row, vector[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(rows[r][col]) > Math.abs(rows[pivot][col])) pivot = r;
    }
    if (Math.abs(rows[pivot][col]) < 1e-12) throw new Error('الزوايا على خط واحد');
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = rows[r][col] / rows[col][col];
      for (let c = col; c <= n; c++) rows[r][c] -= factor * rows[col][c];
    }
  }
  return rows.map((row, i) => row[n] / row[i]);
}

/** تحويل يأخذ المصدر إلى الهدف، لأربع نقاط مناظرة. */
export function computeHomography(from: readonly Point[], to: readonly Point[]): Homography {
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  return solve(a, b) as unknown as Homography;
}

export function applyHomography(h: Homography, x: number, y: number): Point {
  const w = h[6] * x + h[7] * y + 1;
  return { x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w };
}

/** يملأ مخرجاً بعرض وارتفاع محددين من الشكل الرباعي في المصدر (RGBA). */
export function warpPixels(
  source: { data: Uint8ClampedArray; width: number; height: number },
  corners: readonly Point[], width: number, height: number,
): Uint8ClampedArray {
  const target = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
  const h = computeHomography(target, corners);
  const out = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = applyHomography(h, x + 0.5, y + 0.5);
      const sx = Math.max(0, Math.min(source.width - 1.001, p.x - 0.5));
      const sy = Math.max(0, Math.min(source.height - 1.001, p.y - 0.5));
      const [x0, y0] = [Math.floor(sx), Math.floor(sy)];
      const [fx, fy] = [sx - x0, sy - y0];
      const i00 = (y0 * source.width + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + source.width * 4;
      const i11 = i01 + 4;
      const o = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) {
        const top = source.data[i00 + c] * (1 - fx) + source.data[i10 + c] * fx;
        const bottom = source.data[i01 + c] * (1 - fx) + source.data[i11 + c] * fx;
        out[o + c] = top * (1 - fy) + bottom * fy;
      }
    }
  }
  return out;
}
