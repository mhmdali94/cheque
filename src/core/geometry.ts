/** التحويلات الهندسية. الوحدة الداخلية الوحيدة هي المليمتر. */
import type { Calibration, PageAlign, PageMode, PrinterProfile, Rotation } from './types';

export const MM_PER_INCH = 25.4;
export const POINTS_PER_INCH = 72;
export const A4 = { widthMm: 210, heightMm: 297 } as const;

export const mmToPt = (mm: number) => (mm * POINTS_PER_INCH) / MM_PER_INCH;
export const ptToMm = (pt: number) => (pt * MM_PER_INCH) / POINTS_PER_INCH;
export const mmToPx = (mm: number, dpi: number) => (mm * dpi) / MM_PER_INCH;
export const pxToMm = (px: number, dpi: number) => (px * MM_PER_INCH) / dpi;

/** x' = a·x + c·y + e ، y' = b·x + d·y + f */
export type Matrix = readonly [a: number, b: number, c: number, d: number, e: number, f: number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** m ثم n: النتيجة تطبق m أولاً. */
export function compose(m: Matrix, n: Matrix): Matrix {
  return [
    n[0] * m[0] + n[2] * m[1],
    n[1] * m[0] + n[3] * m[1],
    n[0] * m[2] + n[2] * m[3],
    n[1] * m[2] + n[3] * m[3],
    n[0] * m[4] + n[2] * m[5] + n[4],
    n[1] * m[4] + n[3] * m[5] + n[5],
  ];
}

export function applyMatrix(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export const translation = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y];

/** دوران حول نقطة، بزاوية موجبة مع عقارب الساعة (محور y لتحت). */
export function rotationAround(angleDeg: number, cx: number, cy: number): Matrix {
  const rad = (angleDeg * Math.PI) / 180;
  const [cos, sin] = [Math.cos(rad), Math.sin(rad)];
  return compose(compose(translation(-cx, -cy), [cos, sin, -sin, cos, 0, 0]), translation(cx, cy));
}

export interface PageSetup {
  pageWidthMm: number;
  pageHeightMm: number;
  /** من إحداثيات الشيك إلى إحداثيات الصفحة (من أعلى يسار الصفحة). */
  matrix: Matrix;
}

const NO_CALIBRATION = { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 };

type CalibrationValues = Pick<Calibration, 'offsetX' | 'offsetY' | 'scaleX' | 'scaleY'>;
type ProfileValues = Pick<PrinterProfile, 'pageMode' | 'rotation' | 'mirrored' | 'align'>;

function rotationMatrix(rotation: Rotation, lengthMm: number, widthMm: number): Matrix {
  switch (rotation) {
    case 0: return IDENTITY;
    case 90: return [0, 1, -1, 0, widthMm, 0];
    case 180: return [-1, 0, 0, -1, lengthMm, widthMm];
    case 270: return [0, -1, 1, 0, 0, lengthMm];
  }
}

function pageSize(mode: PageMode, localW: number, localH: number) {
  return mode === 'a4'
    ? { pageWidthMm: A4.widthMm, pageHeightMm: A4.heightMm }
    : { pageWidthMm: localW, pageHeightMm: localH };
}

function horizontalPlacement(align: PageAlign, pageW: number, localW: number): number {
  if (align === 'center') return (pageW - localW) / 2;
  return align === 'right' ? pageW - localW : 0;
}

/**
 * الترتيب: مقياس ثم إزاحة بمحاور الشيك، ثم تدوير أو قلب، ثم وضع الشيك على الصفحة
 * ملاصقاً للحافة العليا (الحافة اللي بتدخل الطابعة الأول).
 */
export function buildPageSetup(
  lengthMm: number,
  widthMm: number,
  profile: ProfileValues,
  calibration: CalibrationValues = NO_CALIBRATION,
): PageSetup {
  const sideways = profile.rotation === 90 || profile.rotation === 270;
  const localW = sideways ? widthMm : lengthMm;
  const localH = sideways ? lengthMm : widthMm;
  const page = pageSize(profile.pageMode, localW, localH);

  let matrix: Matrix = [calibration.scaleX, 0, 0, calibration.scaleY, calibration.offsetX, calibration.offsetY];
  matrix = compose(matrix, rotationMatrix(profile.rotation, lengthMm, widthMm));
  if (profile.mirrored) matrix = compose(matrix, [-1, 0, 0, 1, localW, 0]);
  matrix = compose(matrix, translation(horizontalPlacement(profile.align, page.pageWidthMm, localW), 0));

  return { ...page, matrix };
}

/** نسبة التصحيح من قياس مطبوع: الطول المطلوب ÷ الطول الفعلي، تتضرب في المقياس الحالي. */
export function correctedScale(currentScale: number, expectedMm: number, measuredMm: number): number {
  return (currentScale * expectedMm) / measuredMm;
}
