/** ملف PDF للطباعة على أصل الشيك: الكلام فقط، بالأسود، في مكانه بالمليمتر. */
import { PDFDocument } from 'pdf-lib';
import { compose, rotationAround, translation, type Matrix, type PageSetup, applyMatrix } from '@/core/geometry';
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
  /** يرسم حدود الشيك عشان تجربة على ورق A4: الشيك بيتحط فوق الإطار ويتقارن. */
  frame?: { lengthMm: number; widthMm: number };
}

const FRAME_LABEL = 'إطار الشيك: حط الشيك فوقه بالظبط وقارن الكلام';

function drawFrame(sheet: PdfSheet, frame: NonNullable<ChequePdfInput['frame']>, setup: PageSetup, shaper: Shaper): void {
  const { lengthMm: L, widthMm: W } = frame;
  sheet.strokeRect(0, 0, L, W, 0.3, setup.matrix);
  // علامات الأركان بره الإطار عشان تبان حتى لو الحبر خفيف
  const tick = 4;
  for (const [x, y, dx, dy] of [[0, 0, -1, -1], [L, 0, 1, -1], [L, W, 1, 1], [0, W, -1, 1]] as const) {
    sheet.strokeLine(x, y, x + dx * tick, y, 0.3, setup.matrix);
    sheet.strokeLine(x, y, x, y + dy * tick, 0.3, setup.matrix);
  }

  // التعليمات تحت الإطار على الصفحة نفسها لو فيه مكان
  const corners = [[0, 0], [L, 0], [L, W], [0, W]].map(([x, y]) => applyMatrix(setup.matrix, x, y));
  const bottom = Math.max(...corners.map(([, y]) => y));
  const centerX = (Math.min(...corners.map(([x]) => x)) + Math.max(...corners.map(([x]) => x))) / 2;
  if (bottom + 14 < setup.pageHeightMm) {
    const request = { text: FRAME_LABEL, dir: 'rtl' as const, sizePt: 11, bold: true };
    const width = shaper.measure(request);
    sheet.fillOutline(shaper.outline(request).commands, translation(centerX - width / 2, bottom + 10));
  }
}

export async function createChequePdf({ model, setup, shaper, renderer = 'vector', frame }: ChequePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const sheet = new PdfSheet(doc, setup.pageWidthMm, setup.pageHeightMm);
  if (frame) drawFrame(sheet, frame, setup, shaper);
  if (renderer === 'canvas') await drawCanvasText(sheet, model, setup);
  else await drawVectorText(sheet, model, setup, shaper);
  for (const rule of model.rules) {
    sheet.strokeLine(rule.x1, rule.y1, rule.x2, rule.y2, rule.thicknessMm, setup.matrix);
  }
  return doc.save();
}

export const toPdfBlob = (bytes: Uint8Array) => new Blob([bytes as BlobPart], { type: 'application/pdf' });
