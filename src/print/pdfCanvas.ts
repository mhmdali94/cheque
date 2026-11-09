/** طبقة رسم فوق pdf-lib بوحدة المليمتر، ومحور y لتحت. */
import {
  appendBezierCurve, closePath, concatTransformationMatrix, drawObject, fill, lineTo, moveTo, PDFDocument,
  popGraphicsState, pushGraphicsState, rgb, setFillingColor, setLineWidth, setStrokingColor, stroke,
  type Color, type PDFImage, type PDFOperator, type PDFPage,
} from 'pdf-lib';
import { applyMatrix, IDENTITY, mmToPt, type Matrix } from '@/core/geometry';
import type { OutlineCommand } from './shaper';

export const BLACK = rgb(0, 0, 0);

export class PdfSheet {
  readonly page: PDFPage;
  private readonly heightPt: number;
  private readonly doc: PDFDocument;
  private imageCount = 0;

  constructor(doc: PDFDocument, widthMm: number, heightMm: number) {
    this.doc = doc;
    this.heightPt = mmToPt(heightMm);
    this.page = doc.addPage([mmToPt(widthMm), this.heightPt]);
  }

  private toPdf(matrix: Matrix, x: number, y: number): [number, number] {
    const [px, py] = applyMatrix(matrix, x, y);
    return [mmToPt(px), this.heightPt - mmToPt(py)];
  }

  fillOutline(commands: OutlineCommand[], matrix: Matrix = IDENTITY, color: Color = BLACK): void {
    if (commands.length === 0) return;
    const ops: PDFOperator[] = [pushGraphicsState(), setFillingColor(color)];
    let current: [number, number] = [0, 0];
    for (const command of commands) {
      const p = command.pts as number[];
      switch (command.op) {
        case 'M': current = this.toPdf(matrix, p[0], p[1]); ops.push(moveTo(...current)); break;
        case 'L': current = this.toPdf(matrix, p[0], p[1]); ops.push(lineTo(...current)); break;
        case 'Q': {
          // PDF ما عندوش منحنى تربيعي حقيقي، فيتحول لمكعب مكافئ بالظبط.
          const q = this.toPdf(matrix, p[0], p[1]);
          const end = this.toPdf(matrix, p[2], p[3]);
          ops.push(appendBezierCurve(
            current[0] + (2 / 3) * (q[0] - current[0]), current[1] + (2 / 3) * (q[1] - current[1]),
            end[0] + (2 / 3) * (q[0] - end[0]), end[1] + (2 / 3) * (q[1] - end[1]),
            end[0], end[1],
          ));
          current = end;
          break;
        }
        case 'C': {
          const c1 = this.toPdf(matrix, p[0], p[1]);
          const c2 = this.toPdf(matrix, p[2], p[3]);
          const end = this.toPdf(matrix, p[4], p[5]);
          ops.push(appendBezierCurve(...c1, ...c2, ...end));
          current = end;
          break;
        }
        case 'Z': ops.push(closePath()); break;
      }
    }
    ops.push(fill(), popGraphicsState());
    this.page.pushOperators(...ops);
  }

  strokeLine(x1: number, y1: number, x2: number, y2: number, thicknessMm: number, matrix: Matrix = IDENTITY, color: Color = BLACK): void {
    const scale = Math.hypot(matrix[0], matrix[1]) || Math.hypot(matrix[2], matrix[3]);
    this.page.pushOperators(
      pushGraphicsState(), setStrokingColor(color), setLineWidth(mmToPt(thicknessMm * scale)),
      moveTo(...this.toPdf(matrix, x1, y1)), lineTo(...this.toPdf(matrix, x2, y2)), stroke(), popGraphicsState(),
    );
  }

  fillRect(x: number, y: number, w: number, h: number, color: Color, matrix: Matrix = IDENTITY): void {
    const corners: [number, number][] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    this.page.pushOperators(
      pushGraphicsState(), setFillingColor(color),
      moveTo(...this.toPdf(matrix, ...corners[0])), lineTo(...this.toPdf(matrix, ...corners[1])),
      lineTo(...this.toPdf(matrix, ...corners[2])), lineTo(...this.toPdf(matrix, ...corners[3])),
      closePath(), fill(), popGraphicsState(),
    );
  }

  strokeRect(x: number, y: number, w: number, h: number, thicknessMm: number, matrix: Matrix = IDENTITY, color: Color = BLACK): void {
    this.strokeLine(x, y, x + w, y, thicknessMm, matrix, color);
    this.strokeLine(x + w, y, x + w, y + h, thicknessMm, matrix, color);
    this.strokeLine(x + w, y + h, x, y + h, thicknessMm, matrix, color);
    this.strokeLine(x, y + h, x, y, thicknessMm, matrix, color);
  }

  /** يرسم صورة تملأ المستطيل (x,y,w,h) بعد تحويل matrix. */
  drawImageBox(image: PDFImage, x: number, y: number, w: number, h: number, matrix: Matrix = IDENTITY): void {
    const name = `Img${this.imageCount++}`;
    const xObject = this.page.node.newXObject(name, image.ref);
    const origin = this.toPdf(matrix, x, y + h);
    const right = this.toPdf(matrix, x + w, y + h);
    const up = this.toPdf(matrix, x, y);
    this.page.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(right[0] - origin[0], right[1] - origin[1], up[0] - origin[0], up[1] - origin[1], origin[0], origin[1]),
      drawObject(xObject),
      popGraphicsState(),
    );
  }

  embedPng(bytes: Uint8Array | ArrayBuffer) { return this.doc.embedPng(bytes); }
  embedJpg(bytes: Uint8Array | ArrayBuffer) { return this.doc.embedJpg(bytes); }
}
