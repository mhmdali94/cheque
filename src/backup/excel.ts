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
