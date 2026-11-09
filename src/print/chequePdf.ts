/** ملف PDF للطباعة على أصل الشيك: الكلام فقط، بالأسود، في مكانه بالمليمتر. */
import { PDFDocument } from 'pdf-lib';
import { compose, rotationAround, translation, type Matrix, type PageSetup } from '@/core/geometry';
import type { PrintModel, PrintText } from '@/core/layout';
import { PdfSheet } from './pdfCanvas';
import type { Shaper } from './shaper';

export type PdfRenderer = 'vector' | 'canvas';

/** من إحداثيات السطر (خط الأساس) إلى إحداثيات الشيك. */
export function textMatrix(item: PrintText): Matrix {
  const placed = translation(item.x, item.y);
  return item.angleDeg ? compose(placed, rotationAround(item.angleDeg, item.pivot.x, item.pivot.y)) : placed;
}

export async function drawVectorText(sheet: PdfSheet, model: PrintModel, setup: PageSetup, shaper: Shaper): Promise<void> {
  for (const item of model.texts) {
    const { commands } = shaper.outline(item);
    sheet.fillOutline(commands, compose(textMatrix(item), setup.matrix));
  }
}

const CANVAS_DPI = 600;
const PT_PER_INCH = 72;
/** فسحة حول النص عشان التشكيل والنقط ما يتقصوش. */
const CANVAS_PAD_EM = 0.7;

/**
 * راسم بديل: كل حقل في Canvas صغير بدقة ٦٠٠ بدلاً من صفحة كاملة،
 * لأن صفحة A4 بالدقة دي أكبر من حد Canvas على آيفون.
 */
export async function drawCanvasText(sheet: PdfSheet, model: PrintModel, setup: PageSetup): Promise<void> {
  await document.fonts.load('48px "Noto Naskh Print"', 'شيك١');
  for (const item of model.texts) {
    const pxPerPt = CANVAS_DPI / PT_PER_INCH;
    const sizePx = item.sizePt * pxPerPt;
    const pad = sizePx * CANVAS_PAD_EM;
    const mmPerPx = 25.4 / CANVAS_DPI;

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(item.widthMm / mmPerPx + pad * 2);
    canvas.height = Math.ceil(sizePx * 1.5 + pad);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    ctx.font = `${item.bold ? 700 : 400} ${sizePx}px "Noto Naskh Print"`;
    ctx.direction = item.dir;
    ctx.textAlign = 'left';
    const baselinePx = sizePx * 1.1;
    ctx.fillText(item.text, pad, baselinePx);

    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas'))), 'image/png'));
    const image = await sheet.embedPng(await blob.arrayBuffer());
    const [widthMm, heightMm] = [canvas.width * mmPerPx, canvas.height * mmPerPx];
    sheet.drawImageBox(image, -pad * mmPerPx, -baselinePx * mmPerPx, widthMm, heightMm, compose(textMatrix(item), setup.matrix));
  }
}

export interface ChequePdfInput {
  model: PrintModel;
  setup: PageSetup;
  shaper: Shaper;
  renderer?: PdfRenderer;
}

export async function createChequePdf({ model, setup, shaper, renderer = 'vector' }: ChequePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const sheet = new PdfSheet(doc, setup.pageWidthMm, setup.pageHeightMm);
  if (renderer === 'canvas') await drawCanvasText(sheet, model, setup);
  else await drawVectorText(sheet, model, setup, shaper);
  for (const rule of model.rules) {
    sheet.strokeLine(rule.x1, rule.y1, rule.x2, rule.y2, rule.thicknessMm, setup.matrix);
  }
  return doc.save();
}

export const toPdfBlob = (bytes: Uint8Array) => new Blob([bytes as BlobPart], { type: 'application/pdf' });
