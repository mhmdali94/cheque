/** تشكيل النص العربي بـ HarfBuzz وتحويله لمسارات، بنفس الناتج على كل الأجهزة. */
import * as hb from 'harfbuzzjs';
import { splitBidiRuns, type TextDirection } from '@/core/bidi';
import { applyMatrix, ptToMm, type Matrix } from '@/core/geometry';

export type OutlineCommand =
  | { op: 'M' | 'L'; pts: [number, number] }
  | { op: 'Q'; pts: [number, number, number, number] }
  | { op: 'C'; pts: [number, number, number, number, number, number] }
  | { op: 'Z'; pts: [] };

export interface TextOutline {
  /** بالمليمتر من بداية السطر على خط الأساس، ومحور y لتحت. */
  commands: OutlineCommand[];
  widthMm: number;
}

export interface TextRequest {
  text: string;
  dir: TextDirection;
  sizePt: number;
  bold: boolean;
}

export interface TextMeasurer {
  measure(request: TextRequest): number;
}

interface FontHandle {
  font: hb.Font;
  upem: number;
}

interface ShapedText {
  /** بوحدات الخط، ومحور y لفوق. */
  commands: OutlineCommand[];
  width: number;
  upem: number;
}

const CACHE_LIMIT = 500;

function parseSvgPath(d: string, dx: number, dy: number, out: OutlineCommand[]): void {
  for (const match of d.matchAll(/([MLQCZ])([^MLQCZ]*)/g)) {
    const values = match[2].trim() === '' ? [] : match[2].trim().split(/[\s,]+/).map(Number);
    const shifted = values.map((v, i) => v + (i % 2 === 0 ? dx : dy));
    out.push({ op: match[1], pts: shifted } as OutlineCommand);
  }
}

export function transformCommands(commands: OutlineCommand[], matrix: Matrix): OutlineCommand[] {
  return commands.map((command) => {
    const pts: number[] = [];
    for (let i = 0; i < command.pts.length; i += 2) {
      pts.push(...applyMatrix(matrix, command.pts[i], (command.pts as number[])[i + 1]));
    }
    return { op: command.op, pts } as OutlineCommand;
  });
}

export function commandsToSvgPath(commands: OutlineCommand[]): string {
  return commands
    .map((c) => (c.op === 'Z' ? 'Z' : `${c.op}${c.pts.map((v) => v.toFixed(3)).join(' ')}`))
    .join('');
}

export class Shaper implements TextMeasurer {
  private readonly regular: FontHandle;
  private readonly bold: FontHandle;
  private readonly cache = new Map<string, ShapedText>();

  constructor(regularBytes: ArrayBuffer, boldBytes: ArrayBuffer) {
    this.regular = Shaper.load(regularBytes);
    this.bold = Shaper.load(boldBytes);
  }

  private static load(bytes: ArrayBuffer): FontHandle {
    const face = new hb.Face(new hb.Blob(bytes));
    return { font: new hb.Font(face), upem: face.upem };
  }

  private shape(text: string, dir: TextDirection, bold: boolean): ShapedText {
    const key = `${dir}|${bold ? 1 : 0}|${text}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const handle = bold ? this.bold : this.regular;
    const commands: OutlineCommand[] = [];
    let x = 0;
    for (const run of splitBidiRuns(text, dir)) {
      const buffer = new hb.Buffer();
      buffer.addText(run.text);
      buffer.guessSegmentProperties();
      buffer.setDirection(run.dir === 'rtl' ? hb.Direction.RTL : hb.Direction.LTR);
      hb.shape(handle.font, buffer);

      const positions = buffer.getGlyphPositions();
      buffer.getGlyphInfos().forEach((glyph, index) => {
        const position = positions[index];
        const path = handle.font.glyphToPath(glyph.codepoint);
        if (path) parseSvgPath(path, x + position.xOffset, position.yOffset, commands);
        x += position.xAdvance;
      });
    }

    const shaped = { commands, width: x, upem: handle.upem };
    if (this.cache.size >= CACHE_LIMIT) this.cache.clear();
    this.cache.set(key, shaped);
    return shaped;
  }

  measure({ text, dir, sizePt, bold }: TextRequest): number {
    const shaped = this.shape(text, dir, bold);
    return (shaped.width / shaped.upem) * ptToMm(sizePt);
  }

  outline({ text, dir, sizePt, bold }: TextRequest): TextOutline {
    const shaped = this.shape(text, dir, bold);
    const scale = ptToMm(sizePt) / shaped.upem;
    return {
      commands: transformCommands(shaped.commands, [scale, 0, 0, -scale, 0, 0]),
      widthMm: shaped.width * scale,
    };
  }
}

let shaperPromise: Promise<Shaper> | null = null;

/** يحمّل الخطوط مرة واحدة من ملفات التطبيق المدمجة. */
export function loadShaper(): Promise<Shaper> {
  shaperPromise ??= (async () => {
    const fetchFont = async (file: string) => {
      const response = await fetch(`/fonts/${file}`);
      if (!response.ok) throw new Error('تعذر تحميل خط الشيك');
      return response.arrayBuffer();
    };
    const [regular, bold] = await Promise.all([
      fetchFont('NotoNaskhArabic-Regular.ttf'),
      fetchFont('NotoNaskhArabic-Bold.ttf'),
    ]);
    return new Shaper(regular, bold);
  })().catch((error) => {
    shaperPromise = null;
    throw error;
  });
  return shaperPromise;
}
