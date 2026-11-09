import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as hb from 'harfbuzzjs';
import { Shaper } from './shaper';

const read = (file: string) => {
  const buffer = readFileSync(resolve(process.cwd(), 'public/fonts', file));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
};

export const createTestShaper = () => new Shaper(hb, {
  regular: read('NotoNaskhArabic-Regular.ttf'),
  bold: read('NotoNaskhArabic-Bold.ttf'),
  latinRegular: read('NotoSerifLatin-Regular.ttf'),
  latinBold: read('NotoSerifLatin-Bold.ttf'),
});
