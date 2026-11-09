/** فحص الملفات المستوردة قبل دخولها قاعدة البيانات. */
import { z } from 'zod';
import type { ChequeTemplate } from './types';

const num = z.number().finite();
const box = { x: num, y: num, w: num.positive(), h: num.positive() };
const boxSchema = z.object(box);

const textField = z.object({
  ...box,
  fontSizePt: num.positive(),
  minFontSizePt: num.positive(),
  align: z.enum(['right', 'center', 'left']),
  maxLines: z.number().int().positive(),
  enabled: z.boolean(),
  bold: z.boolean(),
});

export const templateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  bankName: z.string().min(1),
  modelName: z.string().min(1),
  lengthMm: num.positive(),
  widthMm: num.positive(),
  accuracy: z.enum(['approximate', 'unmeasured', 'adjusted']),
  micrLineY: num,
  signatureBox: boxSchema,
  crossingGuide: boxSchema,
  date: textField.extend({
    mode: z.enum(['cells', 'text']),
    firstCellCenterX: num,
    cellPitch: num.positive(),
    cellOrder: z.enum(['ltr', 'rtl']),
  }),
  payee: textField,
  amountWords: z.object({ line1: textField, line2: textField, fillRemainder: z.boolean() }),
  amountDigits: textField.extend({ signSide: z.enum(['right', 'left']) }),
  crossing: textField.extend({ angleDeg: num, lineGapMm: num.positive() }),
  signatoryName: textField,
  memo: textField,
  stub: z.object({ enabled: z.boolean(), widthMm: num.positive(), date: textField, payee: textField, amount: textField }),
  imageId: z.string().optional(),
  builtin: z.boolean(),
  createdAt: num,
  updatedAt: num,
});

export const TEMPLATE_FILE_KIND = 'shikaty-template';

export const templateFileSchema = z.object({
  kind: z.literal(TEMPLATE_FILE_KIND),
  dataVersion: z.number().int().positive(),
  template: templateSchema,
  image: z.object({ mime: z.string(), base64: z.string() }).optional(),
});

export type TemplateFile = z.infer<typeof templateFileSchema> & { template: ChequeTemplate };
