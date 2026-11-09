/** ملف النسخة الاحتياطية بامتداد shikaty: تجميع البيانات، فحصها، ودمجها. */
import { z } from 'zod';
import { templateSchema } from '@/core/schemas';
import type {
  AuditEntry, BankAccount, Calibration, Cheque, ChequeBook, ChequeTemplate, Company, Payee, PrinterProfile, SettingEntry, Signatory,
} from '@/core/types';
import { DATA_VERSION, db, type ShikatyDB } from '@/db/schema';
import { getDeviceId } from '@/db/repos';
import { base64ToBlob, blobToBase64 } from '@/ui/download';
import { decryptText, encryptText, sha256Hex, type EncryptedPayload } from './crypto';

const FILE_MAGIC = 'shikaty-backup';

export interface BackupImage {
  id: string;
  mime: string;
  base64: string;
  updatedAt: number;
}

export interface BackupData {
  companies: Company[];
  accounts: BankAccount[];
  books: ChequeBook[];
  cheques: Cheque[];
  templates: ChequeTemplate[];
  images: BackupImage[];
  payees: Payee[];
  signatories: Signatory[];
  printerProfiles: PrinterProfile[];
  calibrations: Calibration[];
  auditLog: AuditEntry[];
  settings: SettingEntry[];
}

const record = z.object({ id: z.string().min(1) }).loose();
const companyRecord = record.extend({ companyId: z.string().min(1) });

const dataSchema = z.object({
  companies: z.array(record),
  accounts: z.array(companyRecord),
  books: z.array(companyRecord),
  cheques: z.array(companyRecord.extend({ status: z.enum(['draft', 'printed', 'cancelled', 'damaged']), updatedAt: z.number() })),
  templates: z.array(templateSchema),
  images: z.array(z.object({ id: z.string(), mime: z.string(), base64: z.string(), updatedAt: z.number() })),
  payees: z.array(companyRecord),
  signatories: z.array(companyRecord),
  printerProfiles: z.array(record),
  calibrations: z.array(record),
  auditLog: z.array(companyRecord),
  settings: z.array(z.object({ key: z.string(), value: z.unknown() })),
});

const fileSchema = z.object({
  magic: z.literal(FILE_MAGIC),
  dataVersion: z.number().int().positive(),
  createdAt: z.number(),
  companyNames: z.array(z.string()),
  sha256: z.string(),
  encrypted: z.boolean(),
  payload: z.union([z.string(), z.object({ salt: z.string(), iv: z.string(), iterations: z.number(), ciphertext: z.string() })]),
});

export type BackupFile = z.infer<typeof fileSchema>;

/** إعدادات تخص الجهاز نفسه ولا تنتقل مع النسخة. */
const isPortableSetting = (key: string) => key === 'pdfRenderer' || key.startsWith('trial:');

export async function collectBackup(companyId: string | null, database: ShikatyDB = db): Promise<BackupData> {
  const scoped = <T extends { companyId: string }>(rows: T[]) => (companyId ? rows.filter((r) => r.companyId === companyId) : rows);

  const companies = (await database.companies.toArray()).filter((c) => !companyId || c.id === companyId);
  const accounts = scoped(await database.accounts.toArray());
  const cheques = scoped(await database.cheques.toArray());

  const usedTemplates = new Set([...accounts.map((a) => a.templateId), ...cheques.map((c) => c.templateId)]);
  const templates = (await database.templates.toArray()).filter((t) => !companyId || usedTemplates.has(t.id) || !t.builtin);
  const imageIds = new Set(templates.flatMap((t) => (t.imageId ? [t.imageId] : [])));
  const images = await Promise.all(
    (await database.images.toArray()).filter((i) => imageIds.has(i.id)).map(async (i) => ({
      id: i.id, mime: i.mime, base64: await blobToBase64(i.data), updatedAt: i.updatedAt,
    })),
  );

  return {
    companies, accounts, cheques, templates, images,
    books: scoped(await database.books.toArray()),
    payees: scoped(await database.payees.toArray()),
    signatories: scoped(await database.signatories.toArray()),
    auditLog: scoped(await database.auditLog.toArray()),
    printerProfiles: await database.printerProfiles.toArray(),
    calibrations: await database.calibrations.toArray(),
    settings: (await database.settings.toArray()).filter((s) => isPortableSetting(s.key)),
  };
}

export async function packBackup(data: BackupData, password?: string): Promise<string> {
  const json = JSON.stringify(data);
  const file: BackupFile = {
    magic: FILE_MAGIC,
    dataVersion: DATA_VERSION,
    createdAt: Date.now(),
    companyNames: data.companies.map((c) => c.name),
    sha256: await sha256Hex(json),
    encrypted: Boolean(password),
    payload: password ? await encryptText(json, password) : json,
  };
  return JSON.stringify(file);
}

export class BackupError extends Error {}

/** ترقية بيانات النسخ الأقدم خطوة بخطوة لما شكل البيانات يتغير. */
const MIGRATIONS: Record<number, (data: unknown) => unknown> = {};

function migrate(data: unknown, fromVersion: number): unknown {
  if (fromVersion > DATA_VERSION) throw new BackupError('الملف ده من إصدار أحدث من التطبيق. حدّث التطبيق الأول.');
  let current = data;
  for (let version = fromVersion; version < DATA_VERSION; version++) {
    const step = MIGRATIONS[version];
    if (step) current = step(current);
  }
  return current;
}

export function readBackupHeader(text: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('الملف ده مش نسخة احتياطية من شيكاتي');
  }
  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) throw new BackupError('الملف ده مش نسخة احتياطية من شيكاتي');
  return parsed.data;
}

export async function unpackBackup(file: BackupFile, password?: string): Promise<BackupData> {
  if (file.encrypted && !password) throw new BackupError('الملف مشفر، اكتب كلمة السر');
  const json = file.encrypted ? await decryptText(file.payload as EncryptedPayload, password!) : (file.payload as string);
  if ((await sha256Hex(json)) !== file.sha256) throw new BackupError('الملف اتغير أو اتلف، بصمة التحقق مش مطابقة');
  const parsed = dataSchema.safeParse(migrate(JSON.parse(json), file.dataVersion));
  if (!parsed.success) throw new BackupError('بيانات الملف ناقصة أو تالفة');
  return parsed.data as unknown as BackupData;
}

export interface MergeTablePlan<T> {
  toPut: T[];
  added: number;
  updated: number;
  unchanged: number;
}

export interface MergePlan {
  cheques: MergeTablePlan<Cheque>;
  /** رقم شيك موجود في نفس الدفتر بمعرّف مختلف. */
  numberConflicts: number;
  tables: Omit<BackupData, 'cheques' | 'images'>;
  images: BackupImage[];
  summary: { newCheques: number; updatedCheques: number; duplicateCheques: number; newCompanies: number; newTemplates: number };
}

/** الشيك اللي اتطبع أو اتقفل ما يرجعش مسودة بسبب ملف قديم. */
function chequeWins(incoming: Cheque, existing: Cheque): boolean {
  if (existing.status !== 'draft' && incoming.status === 'draft') return false;
  if (existing.status === 'draft' && incoming.status !== 'draft') return true;
  return incoming.updatedAt > existing.updatedAt;
}

function mergeNewer<T extends { id: string; updatedAt?: number }>(incoming: T[], existing: T[]): T[] {
  const byId = new Map(existing.map((row) => [row.id, row]));
  return incoming.filter((row) => {
    const local = byId.get(row.id);
    return !local || (row.updatedAt ?? 0) > (local.updatedAt ?? 0);
  });
}

export async function planMerge(data: BackupData, database: ShikatyDB = db): Promise<MergePlan> {
  const localCheques = await database.cheques.toArray();
  const byId = new Map(localCheques.map((c) => [c.id, c]));
  const numberKey = (c: Cheque) => `${c.bookId}:${c.number}`;
  const localNumbers = new Map(localCheques.filter((c) => c.number !== null).map((c) => [numberKey(c), c.id]));

  const cheques: MergeTablePlan<Cheque> = { toPut: [], added: 0, updated: 0, unchanged: 0 };
  let numberConflicts = 0;
  for (const cheque of data.cheques) {
    const local = byId.get(cheque.id);
    if (!local) {
      cheques.added++;
      cheques.toPut.push(cheque);
      const owner = cheque.number !== null ? localNumbers.get(numberKey(cheque)) : undefined;
      if (owner && owner !== cheque.id) numberConflicts++;
    } else if (chequeWins(cheque, local)) {
      cheques.updated++;
      cheques.toPut.push(cheque);
    } else {
      cheques.unchanged++;
    }
  }

  const deviceId = await getDeviceId(database);
  const localAudit = new Set((await database.auditLog.toArray()).map((a) => a.id));
  const localCompanies = new Set((await database.companies.toArray()).map((c) => c.id));
  const localTemplates = await database.templates.toArray();
  const localImages = new Set((await database.images.toArray()).map((i) => i.id));
  const localSettings = new Set((await database.settings.toArray()).map((s) => s.key));

  const templates = mergeNewer(data.templates, localTemplates);
  const newTemplates = templates.filter((t) => !localTemplates.some((l) => l.id === t.id)).length;

  return {
    cheques,
    numberConflicts,
    images: data.images.filter((i) => !localImages.has(i.id)),
    tables: {
      companies: mergeNewer(data.companies, await database.companies.toArray()),
      accounts: mergeNewer(data.accounts, await database.accounts.toArray()),
      books: mergeNewer(data.books, await database.books.toArray()),
      templates,
      payees: mergeNewer(data.payees, await database.payees.toArray()),
      signatories: mergeNewer(data.signatories, await database.signatories.toArray()),
      printerProfiles: mergeNewer(data.printerProfiles, await database.printerProfiles.toArray()),
      calibrations: mergeNewer(data.calibrations.filter((c) => c.deviceId !== deviceId), await database.calibrations.toArray()),
      auditLog: data.auditLog.filter((a) => !localAudit.has(a.id)),
      settings: data.settings.filter((s) => !localSettings.has(s.key)),
    },
    summary: {
      newCheques: cheques.added,
      updatedCheques: cheques.updated,
      duplicateCheques: cheques.unchanged,
      newCompanies: data.companies.filter((c) => !localCompanies.has(c.id)).length,
      newTemplates,
    },
  };
}

const toStoredImage = (image: BackupImage) => ({
  id: image.id, mime: image.mime, data: base64ToBlob(image.base64, image.mime), updatedAt: image.updatedAt,
});

const allTables = (database: ShikatyDB) => [
  database.companies, database.accounts, database.books, database.cheques, database.templates, database.images,
  database.payees, database.signatories, database.printerProfiles, database.calibrations, database.auditLog, database.settings,
];

export async function applyMerge(plan: MergePlan, database: ShikatyDB = db): Promise<void> {
  const images = plan.images.map(toStoredImage);
  await database.transaction('rw', allTables(database), async () => {
    const { tables: t } = plan;
    await database.companies.bulkPut(t.companies);
    await database.accounts.bulkPut(t.accounts);
    await database.books.bulkPut(t.books);
    await database.templates.bulkPut(t.templates);
    await database.images.bulkPut(images);
    await database.cheques.bulkPut(plan.cheques.toPut);
    await database.payees.bulkPut(t.payees);
    await database.signatories.bulkPut(t.signatories);
    await database.printerProfiles.bulkPut(t.printerProfiles);
    await database.calibrations.bulkPut(t.calibrations);
    await database.auditLog.bulkPut(t.auditLog);
    await database.settings.bulkPut(t.settings);
  });
}

/** استبدال الكل: اسم المحاسب ومعرّف الجهاز يفضلوا زي ما هم. */
export async function replaceAll(data: BackupData, database: ShikatyDB = db): Promise<void> {
  const images = data.images.map(toStoredImage);
  await database.transaction('rw', allTables(database), async () => {
    const keep = (await database.settings.bulkGet(['deviceId', 'accountantName'])).filter((s): s is SettingEntry => Boolean(s));
    await Promise.all(allTables(database).map((table) => table.clear()));
    await database.companies.bulkPut(data.companies);
    await database.accounts.bulkPut(data.accounts);
    await database.books.bulkPut(data.books);
    await database.templates.bulkPut(data.templates);
    await database.images.bulkPut(images);
    await database.cheques.bulkPut(data.cheques);
    await database.payees.bulkPut(data.payees);
    await database.signatories.bulkPut(data.signatories);
    await database.printerProfiles.bulkPut(data.printerProfiles);
    await database.calibrations.bulkPut(data.calibrations);
    await database.auditLog.bulkPut(data.auditLog);
    await database.settings.bulkPut([...data.settings, ...keep]);
  });
}
