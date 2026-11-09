import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Shaper } from './shaper';

const read = (file: string) => {
  const buffer = readFileSync(resolve(process.cwd(), 'public/fonts', file));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
};

export const createTestShaper = () => new Shaper(read('NotoNaskhArabic-Regular.ttf'), read('NotoNaskhArabic-Bold.ttf'));
