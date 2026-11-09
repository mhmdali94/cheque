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
  hasMissingGlyphs(request: TextRequest): boolean;
}

interface FontHandle {
  font: hb.Font;
  upem: number;
}

interface ShapedText {
  /** بوحدات الخط، ومحور y لفوق. */
  commands: OutlineCommand[];
  width: number;
  missing: boolean;
}

const CACHE_LIMIT = 500;
/** كل الخطوط تتحول لوحدة واحدة قبل الجمع في سطر واحد. */
const UNITS_PER_EM = 1000;
/** خط النسخ العربي مفيهوش الرموز والحروف اللاتينية، فلها خط احتياطي. */
const NEEDS_FALLBACK = /[!-~\u2013\u2014\u2018-\u201D\u2026]/;

/** أجزاء الجزء الواحد حسب الخط، بالترتيب المنطقي. */
function splitByFont(text: string): { text: string; fallback: boolean }[] {
  const segments: { text: string; fallback: boolean }[] = [];
  for (const char of text) {
    const fallback = NEEDS_FALLBACK.test(char);
    const last = segments[segments.length - 1];
    if (last && last.fallback === fallback) last.text += char;
    else segments.push({ text: char, fallback });
  }
  return segments;
}

export interface ShaperFonts {
  regular: ArrayBuffer;
  bold: ArrayBuffer;
  latinRegular: ArrayBuffer;
  latinBold: ArrayBuffer;
}

function parseSvgPath(d: string, scale: number, dx: number, dy: number, out: OutlineCommand[]): void {
  for (const match of d.matchAll(/([MLQCZ])([^MLQCZ]*)/g)) {
    const values = match[2].trim() === '' ? [] : match[2].trim().split(/[\s,]+/).map(Number);
    const shifted = values.map((v, i) => v * scale + (i % 2 === 0 ? dx : dy));
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
  private readonly fonts: Record<'regular' | 'bold' | 'latinRegular' | 'latinBold', FontHandle>;
  private readonly cache = new Map<string, ShapedText>();

  constructor(fonts: ShaperFonts) {
    this.fonts = {
      regular: Shaper.load(fonts.regular),
      bold: Shaper.load(fonts.bold),
      latinRegular: Shaper.load(fonts.latinRegular),
      latinBold: Shaper.load(fonts.latinBold),
    };
  }

  private static load(bytes: ArrayBuffer): FontHandle {
    const face = new hb.Face(new hb.Blob(bytes));
    return { font: new hb.Font(face), upem: face.upem };
  }

  private shape(text: string, dir: TextDirection, bold: boolean): ShapedText {
    const key = `${dir}|${bold ? 1 : 0}|${text}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const commands: OutlineCommand[] = [];
    let x = 0;
    let missing = false;
    for (const run of splitBidiRuns(text, dir)) {
      const segments = splitByFont(run.text);
      for (const segment of run.dir === 'rtl' ? segments.reverse() : segments) {
        const handle = segment.fallback
          ? (bold ? this.fonts.latinBold : this.fonts.latinRegular)
          : (bold ? this.fonts.bold : this.fonts.regular);
        const scale = UNITS_PER_EM / handle.upem;
        const buffer = new hb.Buffer();
        buffer.addText(segment.text);
        buffer.guessSegmentProperties();
        buffer.setDirection(run.dir === 'rtl' ? hb.Direction.RTL : hb.Direction.LTR);
        hb.shape(handle.font, buffer);

        const positions = buffer.getGlyphPositions();
        buffer.getGlyphInfos().forEach((glyph, index) => {
          const position = positions[index];
          if (glyph.codepoint === 0) missing = true;
          const path = handle.font.glyphToPath(glyph.codepoint);
          if (path) parseSvgPath(path, scale, x + position.xOffset * scale, position.yOffset * scale, commands);
          x += position.xAdvance * scale;
        });
      }
    }

    const shaped = { commands, width: x, missing };
    if (this.cache.size >= CACHE_LIMIT) this.cache.clear();
    this.cache.set(key, shaped);
    return shaped;
  }

  measure({ text, dir, sizePt, bold }: TextRequest): number {
    const shaped = this.shape(text, dir, bold);
    return (shaped.width / UNITS_PER_EM) * ptToMm(sizePt);
  }

  hasMissingGlyphs({ text, dir, bold }: TextRequest): boolean {
    return this.shape(text, dir, bold).missing;
  }

  outline({ text, dir, sizePt, bold }: TextRequest): TextOutline {
    const shaped = this.shape(text, dir, bold);
    const scale = ptToMm(sizePt) / UNITS_PER_EM;
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
    const [regular, bold, latinRegular, latinBold] = await Promise.all([
      fetchFont('NotoNaskhArabic-Regular.ttf'),
      fetchFont('NotoNaskhArabic-Bold.ttf'),
      fetchFont('NotoSerifLatin-Regular.ttf'),
      fetchFont('NotoSerifLatin-Bold.ttf'),
    ]);
    return new Shaper({ regular, bold, latinRegular, latinBold });
  })().catch((error) => {
    shaperPromise = null;
    throw error;
  });
  return shaperPromise;
}
