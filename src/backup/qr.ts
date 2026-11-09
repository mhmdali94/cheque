/** نقل قالب أو شيك واحد برمز QR: JSON مضغوط، بدون صور عشان يدخل في سعة الرمز. */
import { z } from 'zod';
import { templateSchema } from '@/core/schemas';
import type { Cheque, ChequeTemplate } from '@/core/types';

const PREFIX = 'SHK1:';
/** أقصى سعة عملية لرمز يتقري بكاميرا موبايل. */
const MAX_LENGTH = 2300;

export type QrItem = { kind: 'template'; template: ChequeTemplate } | { kind: 'cheque'; cheque: Cheque };

const chequeSchema = z.object({ id: z.string(), companyId: z.string(), bookId: z.string() }).loose();
const itemSchema = z.union([
  z.object({ kind: z.literal('template'), template: templateSchema }),
  z.object({ kind: z.literal('cheque'), cheque: chequeSchema }),
]);

async function pipeThrough(bytes: Uint8Array, stream: { readable: ReadableStream; writable: WritableStream }): Promise<Uint8Array> {
  const output = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(output).arrayBuffer());
}

const toBase64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));

export async function encodeQrItem(item: QrItem): Promise<string> {
  const stripped: QrItem = item.kind === 'template'
    ? { kind: 'template', template: { ...item.template, imageId: undefined } }
    : { kind: 'cheque', cheque: { ...item.cheque, templateSnapshot: undefined } };
  const compressed = await pipeThrough(new TextEncoder().encode(JSON.stringify(stripped)), new CompressionStream('gzip'));
  const text = PREFIX + toBase64(compressed);
  if (text.length > MAX_LENGTH) throw new Error('البيانات أكبر من سعة الرمز. استخدم ملف النسخة الاحتياطية.');
  return text;
}

export async function decodeQrItem(text: string): Promise<QrItem> {
  const invalid = new Error('الرمز ده مش من شيكاتي');
  if (!text.startsWith(PREFIX)) throw invalid;
  try {
    const bytes = Uint8Array.from(atob(text.slice(PREFIX.length)), (c) => c.charCodeAt(0));
    const json = await pipeThrough(bytes, new DecompressionStream('gzip'));
    const parsed = itemSchema.safeParse(JSON.parse(new TextDecoder().decode(json)));
    if (!parsed.success) throw invalid;
    return parsed.data as unknown as QrItem;
  } catch {
    throw invalid;
  }
}
