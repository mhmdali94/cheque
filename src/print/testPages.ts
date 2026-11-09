/** صفحات المعايرة وتحديد الاتجاه. */
import { PDFDocument } from 'pdf-lib';
import { buildPageSetup, compose, translation, type Matrix, type PageSetup } from '@/core/geometry';
import { toArabicDigits } from '@/core/digits';
import type { Calibration, ChequeTemplate, PrinterProfile, TextField } from '@/core/types';
import { PdfSheet } from './pdfCanvas';
import type { Shaper } from './shaper';

export const RULER_LENGTH_MM = 100;

type CalibrationValues = Pick<Calibration, 'offsetX' | 'offsetY' | 'scaleX' | 'scaleY'>;

function label(sheet: PdfSheet, shaper: Shaper, text: string, x: number, y: number, sizePt: number, matrix: Matrix, bold = false): void {
  const { commands } = shaper.outline({ text, dir: 'rtl', sizePt, bold });
  sheet.fillOutline(commands, compose(translation(x, y), matrix));
}

function drawRuler(sheet: PdfSheet, shaper: Shaper, matrix: Matrix, horizontal: boolean, x: number, y: number): void {
  const point = (d: number, off: number): [number, number] => (horizontal ? [x + d, y + off] : [x + off, y + d]);
  sheet.strokeLine(...point(0, 0), ...point(RULER_LENGTH_MM, 0), 0.25, matrix);
  for (let d = 0; d <= RULER_LENGTH_MM; d += 10) {
    sheet.strokeLine(...point(d, 0), ...point(d, 3), 0.25, matrix);
    const [lx, ly] = point(d, 6.5);
    label(sheet, shaper, toArabicDigits(d), lx - 1, ly, 7, matrix);
  }
}

function fieldBoxes(template: ChequeTemplate): TextField[] {
  return [template.date, template.payee, template.amountWords.line1, template.amountWords.line2, template.amountDigits, template.signatoryName];
}

/** صفحة A4: مسطرتان بطول ١٠٠ مم وإطار الشيك ومربعات الحقول، بنفس تحويل الطباعة. */
export async function createCalibrationPdf(
  template: ChequeTemplate, profile: PrinterProfile, calibration: CalibrationValues, shaper: Shaper,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const setup = buildPageSetup(template.lengthMm, template.widthMm, { ...profile, pageMode: 'a4' }, calibration);
  const sheet = new PdfSheet(doc, setup.pageWidthMm, setup.pageHeightMm);

  sheet.strokeRect(0, 0, template.lengthMm, template.widthMm, 0.25, setup.matrix);
  for (const box of fieldBoxes(template)) sheet.strokeRect(box.x, box.y, box.w, box.h, 0.15, setup.matrix);

  drawRuler(sheet, shaper, setup.matrix, true, 40, template.widthMm + 10);
  drawRuler(sheet, shaper, setup.matrix, false, template.lengthMm + 12, -8);

  label(sheet, shaper, 'صفحة معايرة: قِس المسطرتين وادخل القياس في التطبيق', 60, 215, 12, [1, 0, 0, 1, 0, 0], true);
  label(sheet, shaper, 'المسطرة الموازية لطول الشيك = الطول ، والموازية لعرض الشيك = العرض', 45, 225, 10, [1, 0, 0, 1, 0, 0]);
  return doc.save();
}

/** سهم وكلمة «أعلى» يشاوروا على الحافة العليا للشيك في وضع القراءة. */
export async function createDirectionPdf(
  template: ChequeTemplate, profile: PrinterProfile, calibration: CalibrationValues, shaper: Shaper,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const setup: PageSetup = buildPageSetup(template.lengthMm, template.widthMm, profile, calibration);
  const sheet = new PdfSheet(doc, setup.pageWidthMm, setup.pageHeightMm);
  const cx = template.lengthMm / 2;

  sheet.strokeLine(cx, 62, cx, 22, 1.2, setup.matrix);
  sheet.strokeLine(cx, 22, cx - 8, 32, 1.2, setup.matrix);
  sheet.strokeLine(cx, 22, cx + 8, 32, 1.2, setup.matrix);

  const word = { text: 'أعلى', dir: 'rtl' as const, sizePt: 30, bold: true };
  sheet.fillOutline(shaper.outline(word).commands, compose(translation(cx - shaper.measure(word) / 2, 76), setup.matrix));
  return doc.save();
}
