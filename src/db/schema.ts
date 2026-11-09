import Dexie, { type EntityTable } from 'dexie';
import type {
  AuditEntry, BankAccount, Calibration, Cheque, ChequeBook, ChequeTemplate, Company,
  Payee, PrinterProfile, SettingEntry, Signatory, StoredImage,
} from '@/core/types';

/** يُرفع مع أي تغيير في شكل البيانات، ويُكتب في ملفات النسخ الاحتياطي. */
export const DATA_VERSION = 1;

export class ShikatyDB extends Dexie {
  companies!: EntityTable<Company, 'id'>;
  accounts!: EntityTable<BankAccount, 'id'>;
  books!: EntityTable<ChequeBook, 'id'>;
  cheques!: EntityTable<Cheque, 'id'>;
  templates!: EntityTable<ChequeTemplate, 'id'>;
  images!: EntityTable<StoredImage, 'id'>;
  payees!: EntityTable<Payee, 'id'>;
  signatories!: EntityTable<Signatory, 'id'>;
  printerProfiles!: EntityTable<PrinterProfile, 'id'>;
  calibrations!: EntityTable<Calibration, 'id'>;
  auditLog!: EntityTable<AuditEntry, 'id'>;
  settings!: EntityTable<SettingEntry, 'key'>;

  constructor(name = 'shikaty') {
    super(name);
    // أي تغيير لاحق: this.version(2).stores(...).upgrade(...) مع رفع DATA_VERSION.
    this.version(1).stores({
      companies: 'id, name',
      accounts: 'id, companyId',
      books: 'id, companyId, accountId',
      cheques: 'id, companyId, bookId, status, date, number, updatedAt, [bookId+number]',
      templates: 'id',
      images: 'id',
      payees: 'id, companyId, [companyId+name]',
      signatories: 'id, companyId, [companyId+name]',
      printerProfiles: 'id',
      calibrations: 'id, printerId, deviceId',
      auditLog: 'id, chequeId, companyId, at',
      settings: 'key',
    });
  }
}

export const db = new ShikatyDB();
