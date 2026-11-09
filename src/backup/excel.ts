/** تصدير سجل الشيكات لملف Excel. القيم حقيقية، والتنسيق يعرضها بأرقام عربية. */
import type { Cheque, ChequeBook, ChequeStatus, Company, BankAccount } from '@/core/types';
import { toArabicDigits } from '@/core/digits';
import { parseIsoDate } from '@/core/date';

export const ARABIC_NUMBER_FORMAT = '[$-2000000]#,##0';
export const ARABIC_DATE_FORMAT = '[$-2000401]dd/mm/yyyy';

export const STATUS_LABEL: Record<ChequeStatus, string> = {
  draft: 'مسودة', printed: 'مطبوع', cancelled: 'ملغي', damaged: 'تالف',
};

export interface ChequeExportContext {
  companies: Map<string, Company>;
  accounts: Map<string, BankAccount>;
  books: Map<string, ChequeBook>;
}

const excelDate = (iso: string): Date | null => {
  const parsed = parseIsoDate(iso);
  return parsed ? new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)) : null;
};

export async function createChequesWorkbook(cheques: Cheque[], context: ChequeExportContext): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('سجل الشيكات', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: 'الشركة', key: 'company', width: 26 },
    { header: 'البنك', key: 'bank', width: 24 },
    { header: 'رقم الشيك', key: 'number', width: 14 },
    { header: 'التاريخ', key: 'date', width: 14, style: { numFmt: ARABIC_DATE_FORMAT } },
    { header: 'المستفيد', key: 'payee', width: 32 },
    { header: 'المبلغ', key: 'amount', width: 18, style: { numFmt: ARABIC_NUMBER_FORMAT } },
    { header: 'البيان', key: 'memo', width: 28 },
    { header: 'الحالة', key: 'status', width: 10 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const cheque of cheques) {
    const book = context.books.get(cheque.bookId);
    sheet.addRow({
      company: context.companies.get(cheque.companyId)?.name ?? '',
      bank: context.accounts.get(cheque.accountId)?.bankName ?? '',
      number: cheque.number === null ? '' : toArabicDigits(String(cheque.number).padStart(book?.numberWidth ?? 0, '0')),
      date: excelDate(cheque.date),
      payee: cheque.payee,
      amount: cheque.amount,
      memo: toArabicDigits(cheque.memo),
      status: STATUS_LABEL[cheque.status],
    });
  }
  return workbook.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const BATCH_HEADERS = ['المستفيد', 'المبلغ', 'التاريخ', 'البيان'] as const;

export interface BatchRow {
  rowNumber: number;
  payee: string;
  amount: number | null;
  date: string;
  memo: string;
  errors: string[];
}

export async function createBatchTemplate(): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('الشيكات', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: BATCH_HEADERS[0], width: 34 },
    { header: BATCH_HEADERS[1], width: 16, style: { numFmt: ARABIC_NUMBER_FORMAT } },
    { header: BATCH_HEADERS[2], width: 14, style: { numFmt: ARABIC_DATE_FORMAT } },
    { header: BATCH_HEADERS[3], width: 30 },
  ];
  sheet.getRow(1).font = { bold: true };
  return workbook.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && 'text' in value) return String((value as { text: unknown }).text);
  if (typeof value === 'object' && 'result' in value) return String((value as { result: unknown }).result ?? '');
  return String(value);
}

/** يقبل تاريخ Excel الحقيقي، أو نص يوم/شهر/سنة بأرقام عربية أو لاتينية. */
function parseCellDate(value: unknown, fallback: string, toLatin: (s: string) => string): string | null {
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
  }
  const text = toLatin(cellText(value)).trim();
  if (!text) return fallback;
  const match = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(text);
  if (!match) return null;
  const iso = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  return parseIsoDate(iso) ? iso : null;
}

export async function parseBatchWorkbook(
  buffer: ArrayBuffer, today: string,
  helpers: { toLatin: (s: string) => string; parseAmount: (s: string) => { ok: true; value: number } | { ok: false; error: string } },
): Promise<BatchRow[]> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headers = BATCH_HEADERS.map((_, i) => cellText(sheet.getCell(1, i + 1).value).trim());
  if (headers.join('|') !== BATCH_HEADERS.join('|')) {
    throw new Error('عناوين الأعمدة مختلفة عن القالب. نزّل القالب واملاه.');
  }

  const rows: BatchRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const raw = [1, 2, 3, 4].map((c) => row.getCell(c).value);
    if (raw.every((v) => cellText(v).trim() === '')) continue;

    const errors: string[] = [];
    const payee = cellText(raw[0]).trim();
    if (!payee) errors.push('المستفيد ناقص');
    const amount = helpers.parseAmount(cellText(raw[1]));
    if (!amount.ok) errors.push(amount.error);
    const date = parseCellDate(raw[2], today, helpers.toLatin);
    if (date === null) errors.push('التاريخ مش مفهوم');
    rows.push({ rowNumber: r, payee, amount: amount.ok ? amount.value : null, date: date ?? today, memo: cellText(raw[3]).trim(), errors });
  }
  return rows;
}
