/** نسخة المراجعة: الشيك كامل على A4 بعلامة مائية، وبدون منطقة الترميز المغناطيسي. */
import { PDFDocument, rgb } from 'pdf-lib';
import { A4, compose, rotationAround, translation, type Matrix } from '@/core/geometry';
import type { PrintModel } from '@/core/layout';
import { toArabicDigits } from '@/core/digits';
import type { ChequeTemplate } from '@/core/types';
import { textMatrix } from './chequePdf';
import { BLACK, PdfSheet } from './pdfCanvas';
import type { Shaper } from './shaper';

export const WATERMARK_TEXT = 'نسخة مراجعة — ليست شيكاً — غير صالحة للصرف';

const PAGE_MARGIN_MM = 8;
const CAPTION_MM = 17;
const BANK_TINT = rgb(0.93, 0.95, 0.92);
const PRINTED = rgb(0.45, 0.47, 0.5);
const FAINT = rgb(0.75, 0.77, 0.79);
const WATERMARK = rgb(0.72, 0.15, 0.15);
const IMAGE_DPI = 200;

export interface ReviewItem {
  template: ChequeTemplate;
  model: PrintModel;
  chequeNumber?: string;
  /** صورة الشيك الفارغ لو موجودة. */
  photo?: Blob;
}

export interface ReviewInfo {
  accountant: string;
  preparedDate: string;
}

/** الصورة تتدمج في طبقة واحدة بعد مسح منطقة الترميز، فمفيش بيانات مخفية تحت غطاء. */
async function photoWithoutMicr(photo: Blob, template: ChequeTemplate): Promise<ArrayBuffer> {
  const bitmap = await createImageBitmap(photo);
  const canvas = document.createElement('canvas');
  const pxPerMm = IMAGE_DPI / 25.4;
  canvas.width = Math.round(template.lengthMm * pxPerMm);
  canvas.height = Math.round(template.widthMm * pxPerMm);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  ctx.fillStyle = '#fff';
  const top = Math.floor(template.micrLineY * pxPerMm);
  ctx.fillRect(0, top, canvas.width, canvas.height - top);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas'))), 'image/jpeg', 0.85));
  return blob.arrayBuffer();
}

function write(sheet: PdfSheet, shaper: Shaper, text: string, x: number, y: number, sizePt: number, matrix: Matrix, bold = false, align: 'start' | 'center' = 'start'): void {
  const request = { text, dir: 'rtl' as const, sizePt, bold };
  const width = shaper.measure(request);
  const left = align === 'center' ? x - width / 2 : x - width;
  sheet.fillOutline(shaper.outline(request).commands, compose(translation(left, y), matrix));
}

function drawNeutralBackground(sheet: PdfSheet, item: ReviewItem, shaper: Shaper, matrix: Matrix): void {
  const { template: t } = item;
  sheet.fillRect(0, 0, t.lengthMm, t.micrLineY, BANK_TINT, matrix);
  write(sheet, shaper, t.bankName, 40, 9, 10, matrix, true);
  write(sheet, shaper, 'شيك', t.lengthMm / 2, 8, 9, matrix, false, 'center');
  if (item.chequeNumber) {
    const request = { text: toArabicDigits(item.chequeNumber), dir: 'ltr' as const, sizePt: 8, bold: false };
    sheet.fillOutline(shaper.outline(request).commands, compose(translation(t.lengthMm / 2 - shaper.measure(request) / 2, 13), matrix), PRINTED);
  }
  for (const f of [t.payee, t.amountWords.line1, t.amountWords.line2]) {
    sheet.strokeLine(f.x, f.y + f.h, f.x + f.w, f.y + f.h, 0.15, matrix, FAINT);
  }
  const d = t.amountDigits;
  sheet.strokeRect(d.x, d.y, d.w, d.h, 0.15, matrix, FAINT);
  if (t.date.mode === 'cells') {
    for (let i = 0; i < 8; i++) sheet.strokeRect(t.date.firstCellCenterX + (i - 0.5) * t.date.cellPitch, t.date.y, t.date.cellPitch, t.date.h, 0.15, matrix, FAINT);
  }
  const s = t.signatureBox;
  sheet.strokeRect(s.x, s.y, s.w, s.h, 0.15, matrix, FAINT);
  write(sheet, shaper, 'مكان التوقيع', s.x + s.w / 2, s.y + s.h / 2 + 1, 8, matrix, false, 'center');
}

/** صفحة واحدة تستوعب من شيك إلى أربعة شيكات، والمقياس يتصغر لو لزم. */
export async function createReviewPdf(items: ReviewItem[], info: ReviewInfo, shaper: Shaper): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const perPage = Math.max(1, Math.min(4, items.length));

  for (let start = 0; start < items.length; start += perPage) {
    const sheet = new PdfSheet(doc, A4.widthMm, A4.heightMm);
    const slotHeight = (A4.heightMm - PAGE_MARGIN_MM * 2) / perPage;

    for (const [slot, item] of items.slice(start, start + perPage).entries()) {
      const { template: t, model } = item;
      const scale = Math.min(1, (A4.widthMm - PAGE_MARGIN_MM * 2) / t.lengthMm, (slotHeight - CAPTION_MM - 2) / t.widthMm);
      const left = (A4.widthMm - t.lengthMm * scale) / 2;
      const top = PAGE_MARGIN_MM + slot * slotHeight;
      const matrix: Matrix = [scale, 0, 0, scale, left, top];

      if (item.photo) {
        const image = await sheet.embedJpg(await photoWithoutMicr(item.photo, t));
        sheet.drawImageBox(image, 0, 0, t.lengthMm, t.widthMm, matrix);
      } else {
        drawNeutralBackground(sheet, item, shaper, matrix);
      }

      for (const text of model.texts) sheet.fillOutline(shaper.outline(text).commands, compose(textMatrix(text), matrix));
      for (const r of model.rules) sheet.strokeLine(r.x1, r.y1, r.x2, r.y2, r.thicknessMm, matrix);
      sheet.strokeRect(0, 0, t.lengthMm, t.micrLineY, 0.2, matrix, PRINTED);

      const watermark = { text: WATERMARK_TEXT, dir: 'rtl' as const, sizePt: 15, bold: true };
      const width = shaper.measure(watermark);
      const mid = { x: t.lengthMm / 2, y: t.micrLineY / 2 };
      const place = compose(compose(translation(mid.x - width / 2, mid.y + 2), rotationAround(-14, mid.x, mid.y)), matrix);
      sheet.fillOutline(shaper.outline(watermark).commands, place, WATERMARK);

      const page: Matrix = [1, 0, 0, 1, 0, 0];
      const captionTop = top + t.micrLineY * scale + 5;
      const right = A4.widthMm - left;
      write(sheet, shaper, `المحاسب: ${toArabicDigits(info.accountant)}`, right, captionTop, 10, page);
      write(sheet, shaper, `تاريخ التحضير: ${info.preparedDate}`, right, captionTop + 6, 10, page);
      write(sheet, shaper, 'توقيع المدير:', left + 70, captionTop + 3, 10, page, true);
      sheet.strokeLine(left, captionTop + 4, left + 45, captionTop + 4, 0.2, page, BLACK);
    }
  }
  return doc.save();
}
