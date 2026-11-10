import { beforeEach, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { builtinTemplates } from '@/core/templates';
import type { Calibration, Cheque, Company } from '@/core/types';
import { ShikatyDB } from '@/db/schema';
import { ensureSeeded } from '@/db/seed';
import { decryptText, encryptText, sha256Hex, WrongPasswordError } from './crypto';
import { ARABIC_NUMBER_FORMAT, createChequesWorkbook } from './excel';
import { applyMerge, BackupError, collectBackup, packBackup, planMerge, readBackupHeader, replaceAll, unpackBackup } from './format';
import { decodeQrItem, encodeQrItem } from './qr';

const company = (id: string): Company => ({ id, name: `شركة ${id}`, color: 'red', tafqeetPresetId: 'accounting', amountProtection: 'slash', createdAt: 1, updatedAt: 1 });
const cheque = (id: string, overrides: Partial<Cheque> = {}): Cheque => ({
  id, companyId: 'c1', accountId: 'a1', bookId: 'b1', templateId: 'tpl-ahly-qr', number: 100, status: 'draft',
  payee: 'مستفيد', amount: 500, amountInput: '500', date: '2026-03-14', memo: '', signatoryName: '',
  crossing: { kind: 'none', text: '', drawLines: false }, printStub: false, printCount: 0, createdAt: 1, updatedAt: 10, ...overrides,
});

const open = async () => {
  const database = new ShikatyDB(`test-${crypto.randomUUID()}`);
  await database.open();
  await ensureSeeded(database);
  return database;
};

let source: ShikatyDB;
let target: ShikatyDB;

beforeEach(async () => {
  source = await open();
  target = await open();
  await source.companies.bulkAdd([company('c1'), company('c2')]);
  await source.cheques.bulkAdd([cheque('x'), cheque('y', { companyId: 'c2', number: 200 })]);
  await source.auditLog.add({ id: 'l1', chequeId: 'x', companyId: 'c1', action: 'create', accountant: 'سارة', at: 5, detail: '' });
});

describe('التشفير', () => {
  it('يرجع النص الأصلي', async () => {
    const encrypted = await encryptText('بيانات مالية', 'سر', 1000);
    expect(encrypted.ciphertext).not.toContain('بيانات');
    expect(await decryptText(encrypted, 'سر')).toBe('بيانات مالية');
  });
  it('كلمة سر غلط', async () => {
    await expect(decryptText(await encryptText('نص', 'سر', 1000), 'غلط')).rejects.toBeInstanceOf(WrongPasswordError);
  });
  it('البصمة', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('النسخة الاحتياطية', () => {
  it('تصدير ثم استيراد في قاعدة نظيفة يرجّع نفس البيانات', async () => {
    const data = await collectBackup(null, source);
    const restored = await unpackBackup(readBackupHeader(await packBackup(data)));
    await applyMerge(await planMerge(restored, target), target);
    for (const table of ['companies', 'cheques', 'auditLog'] as const) {
      const sort = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
      expect(sort(await target[table].toArray() as { id: string }[])).toEqual(sort(await source[table].toArray() as { id: string }[]));
    }
  });

  it('بكلمة سر', async () => {
    const text = await packBackup(await collectBackup(null, source), 'سر');
    expect(text).not.toContain('مستفيد');
    const header = readBackupHeader(text);
    await expect(unpackBackup(header)).rejects.toBeInstanceOf(BackupError);
    expect((await unpackBackup(header, 'سر')).cheques).toHaveLength(2);
  }, 20_000);

  it('تصدير شركة واحدة ما يطلّعش بيانات الشركات التانية', async () => {
    const data = await collectBackup('c1', source);
    expect(data.companies.map((c) => c.id)).toEqual(['c1']);
    expect(data.cheques.map((c) => c.id)).toEqual(['x']);
  });

  it('ملف متلاعب فيه يترفض', async () => {
    const file = readBackupHeader(await packBackup(await collectBackup(null, source)));
    await expect(unpackBackup({ ...file, payload: (file.payload as string).replace('500', '900') })).rejects.toThrow('بصمة');
  });

  it('ملف من إصدار أحدث يترفض', async () => {
    const file = readBackupHeader(await packBackup(await collectBackup(null, source)));
    await expect(unpackBackup({ ...file, dataVersion: 99 })).rejects.toThrow('أحدث');
  });

  it('ملف عشوائي يترفض', () => expect(() => readBackupHeader('{"a":1}')).toThrow(BackupError));

  it('المعاينة تعد الجديد والمكرر', async () => {
    const data = await collectBackup(null, source);
    await target.cheques.add(cheque('x'));
    const { summary } = await planMerge(data, target);
    expect(summary).toMatchObject({ newCheques: 1, duplicateCheques: 1, newCompanies: 2 });
  });

  it('المطبوع ما يرجعش مسودة حتى لو الملف أحدث', async () => {
    await target.cheques.add(cheque('x', { status: 'printed', updatedAt: 5 }));
    const data = await collectBackup(null, source);
    const plan = await planMerge({ ...data, cheques: data.cheques.map((c) => ({ ...c, updatedAt: 99 })) }, target);
    expect(plan.cheques.toPut.some((c) => c.id === 'x')).toBe(false);
  });

  it('الأحدث يكسب بين المسودات', async () => {
    await target.cheques.add(cheque('x', { updatedAt: 5 }));
    const plan = await planMerge(await collectBackup(null, source), target);
    expect(plan.cheques.toPut.some((c) => c.id === 'x')).toBe(true);
  });

  it('رقم مكرر بمعرّف مختلف يتعد', async () => {
    await target.cheques.add(cheque('other'));
    expect((await planMerge(await collectBackup(null, source), target)).numberConflicts).toBe(1);
  });

  it('معايرة الجهاز الحالي ما يتكتبش فوقها', async () => {
    await target.settings.put({ key: 'deviceId', value: 'mine' });
    const calibration: Calibration = { id: 'p:mine', printerId: 'p', deviceId: 'mine', deviceName: '', offsetX: 9, offsetY: 9, scaleX: 1, scaleY: 1, updatedAt: 999 };
    const data = await collectBackup(null, source);
    expect((await planMerge({ ...data, calibrations: [calibration] }, target)).tables.calibrations).toEqual([]);
  });

  it('استبدال الكل يحافظ على معرّف الجهاز', async () => {
    await target.settings.put({ key: 'deviceId', value: 'mine' });
    await target.companies.add(company('old'));
    await replaceAll(await collectBackup(null, source), target);
    expect(await target.companies.get('old')).toBeUndefined();
    expect((await target.settings.get('deviceId'))?.value).toBe('mine');
  });
});

describe('رمز QR', () => {
  it('قالب ذهاباً وإياباً', async () => {
    const template = builtinTemplates()[0];
    const item = await decodeQrItem(await encodeQrItem({ kind: 'template', template }));
    expect(item.kind === 'template' && item.template.id).toBe(template.id);
  });
  it('نص غريب يترفض', async () => {
    await expect(decodeQrItem('hello')).rejects.toThrow('مش من شيكاتي');
    await expect(decodeQrItem('SHK1:@@')).rejects.toThrow('مش من شيكاتي');
  });
});

describe('ملف Excel', () => {
  it('عناوين عربية وقيم حقيقية بتنسيق عربي', async () => {
    const buffer = await createChequesWorkbook([cheque('x', { amount: 148500 })], {
      companies: new Map([['c1', company('c1')]]), accounts: new Map(), books: new Map(),
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    expect(sheet.views[0].rightToLeft).toBe(true);
    expect(sheet.getCell('F1').value).toBe('المبلغ');
    expect(sheet.getCell('F2').value).toBe(148500);
    expect(sheet.getCell('F2').numFmt).toBe(ARABIC_NUMBER_FORMAT);
    expect(sheet.getCell('C2').value).toBe('١٠٠');
    expect(sheet.getCell('H2').value).toBe('مسودة');
  });
});
