import type { AuditAction, Cheque, ChequeBook } from '@/core/types';
import { db, type ShikatyDB } from './schema';

export const newId = (): string => crypto.randomUUID();

export async function getSetting<T>(key: string, fallback: T, database: ShikatyDB = db): Promise<T> {
  const entry = await database.settings.get(key);
  return entry === undefined ? fallback : (entry.value as T);
}

export async function setSetting(key: string, value: unknown, database: ShikatyDB = db): Promise<void> {
  await database.settings.put({ key, value });
}

/** معرّف ثابت لهذا الجهاز، تُربط به المعايرة. */
export async function getDeviceId(database: ShikatyDB = db): Promise<string> {
  const existing = await getSetting<string | null>('deviceId', null, database);
  if (existing) return existing;
  const id = newId();
  await setSetting('deviceId', id, database);
  return id;
}

export async function getAccountantName(database: ShikatyDB = db): Promise<string> {
  return getSetting('accountantName', '', database);
}

/** سجل المراجعة إضافة فقط: لا توجد دالة لتعديله أو حذفه. */
export async function logAudit(
  cheque: Pick<Cheque, 'id' | 'companyId'>,
  action: AuditAction,
  detail = '',
  database: ShikatyDB = db,
): Promise<void> {
  await database.auditLog.add({
    id: newId(),
    chequeId: cheque.id,
    companyId: cheque.companyId,
    action,
    accountant: await getAccountantName(database),
    at: Date.now(),
    detail,
  });
}

/** الأرقام المستخدمة في الدفتر، باستثناء التالف والملغي لا يُعاد استخدامها أيضاً. */
export async function usedNumbers(bookId: string, excludeChequeId?: string, database: ShikatyDB = db): Promise<Set<number>> {
  const cheques = await database.cheques.where('bookId').equals(bookId).toArray();
  return new Set(
    cheques.filter((c) => c.id !== excludeChequeId && c.number !== null).map((c) => c.number as number),
  );
}

/** أول رقم فاضي في الدفتر، أو null لو الدفتر خلص. */
export async function nextChequeNumber(book: ChequeBook, excludeChequeId?: string, database: ShikatyDB = db): Promise<number | null> {
  const used = await usedNumbers(book.id, excludeChequeId, database);
  for (let n = book.fromNumber; n <= book.toNumber; n++) {
    if (!used.has(n)) return n;
  }
  return null;
}

export async function remainingInBook(book: ChequeBook, database: ShikatyDB = db): Promise<number> {
  const total = book.toNumber - book.fromNumber + 1;
  const used = await usedNumbers(book.id, undefined, database);
  const inRange = [...used].filter((n) => n >= book.fromNumber && n <= book.toNumber).length;
  return total - inRange;
}
