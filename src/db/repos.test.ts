import { beforeEach, describe, expect, it } from 'vitest';
import type { Cheque, ChequeBook } from '@/core/types';
import { ShikatyDB } from './schema';
import { getDeviceId, logAudit, nextChequeNumber, remainingInBook } from './repos';

const book: ChequeBook = {
  id: 'b1', companyId: 'c1', accountId: 'a1', fromNumber: 100, toNumber: 102, numberWidth: 6, createdAt: 0, updatedAt: 0,
};

const cheque = (id: string, number: number): Cheque => ({
  id, companyId: 'c1', accountId: 'a1', bookId: 'b1', templateId: 't1', number, status: 'draft',
  payee: '', amount: null, amountInput: '', date: '2026-01-01', memo: '', signatoryName: '',
  crossing: { kind: 'none', text: '', drawLines: false }, printStub: false, printCount: 0, createdAt: 0, updatedAt: 0,
});

let database: ShikatyDB;

beforeEach(async () => {
  database = new ShikatyDB(`test-${crypto.randomUUID()}`);
  await database.open();
});

describe('التخزين', () => {
  it('معرّف الجهاز ثابت', async () => {
    const first = await getDeviceId(database);
    expect(await getDeviceId(database)).toBe(first);
  });

  it('الرقم التالي يقفز فوق المستخدم وينتهي بنهاية الدفتر', async () => {
    expect(await nextChequeNumber(book, undefined, database)).toBe(100);
    await database.cheques.bulkAdd([cheque('x', 100), cheque('y', 101)]);
    expect(await nextChequeNumber(book, undefined, database)).toBe(102);
    expect(await nextChequeNumber(book, 'y', database)).toBe(101);
    await database.cheques.add(cheque('z', 102));
    expect(await nextChequeNumber(book, undefined, database)).toBeNull();
  });

  it('عداد المتبقي', async () => {
    await database.cheques.add(cheque('x', 101));
    expect(await remainingInBook(book, database)).toBe(2);
  });

  it('سجل المراجعة يكتب اسم المحاسب والوقت', async () => {
    await database.settings.put({ key: 'accountantName', value: 'سارة' });
    await logAudit(cheque('x', 100), 'print', '', database);
    const [entry] = await database.auditLog.toArray();
    expect(entry).toMatchObject({ chequeId: 'x', action: 'print', accountant: 'سارة' });
    expect(entry.at).toBeGreaterThan(0);
  });
});
