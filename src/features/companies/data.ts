import type { BankAccount, ChequeBook, ChequeTemplate, Company } from '@/core/types';
import { newId, setSetting } from '@/db/repos';
import { db } from '@/db/schema';

/** ألوان غامقة بما يكفي لنص فاتح فوقها، ومتباعدة عشان الشركات ما تتلخبطش. */
export const COMPANY_COLORS = [
  { value: 'oklch(0.4 0.09 165)', name: 'أخضر' },
  { value: 'oklch(0.42 0.12 255)', name: 'أزرق' },
  { value: 'oklch(0.43 0.15 25)', name: 'أحمر' },
  { value: 'oklch(0.42 0.13 310)', name: 'بنفسجي' },
  { value: 'oklch(0.46 0.1 60)', name: 'بني' },
  { value: 'oklch(0.42 0.08 215)', name: 'فيروزي' },
  { value: 'oklch(0.36 0.02 260)', name: 'رمادي' },
];

export async function addCompany(name: string, color: string): Promise<Company> {
  const now = Date.now();
  const company: Company = {
    id: newId(), name: name.trim(), color, tafqeetPresetId: 'accounting', amountProtection: 'slash', createdAt: now, updatedAt: now,
  };
  await db.companies.add(company);
  await setSetting('currentCompanyId', company.id);
  return company;
}

export async function addAccount(input: Pick<BankAccount, 'companyId' | 'bankName' | 'label' | 'accountNumber' | 'templateId'>): Promise<BankAccount> {
  const now = Date.now();
  const account: BankAccount = { ...input, id: newId(), createdAt: now, updatedAt: now };
  await db.accounts.add(account);
  return account;
}

/** طول الرقم الأطول يحدد عدد الخانات، عشان الأصفار البادئة تفضل زي الدفتر. */
export async function addBook(input: Pick<ChequeBook, 'companyId' | 'accountId' | 'fromNumber' | 'toNumber'> & { numberWidth: number }): Promise<ChequeBook> {
  const now = Date.now();
  const book: ChequeBook = { ...input, id: newId(), createdAt: now, updatedAt: now };
  await db.books.add(book);
  return book;
}

/** النماذج المقاسة أولاً، فالاختيار الافتراضي يبقى الأدق. */
export async function orderedTemplates(): Promise<ChequeTemplate[]> {
  const rank = (t: ChequeTemplate) => (t.accuracy === 'unmeasured' ? 1 : 0);
  return (await db.templates.toArray()).sort((a, b) => rank(a) - rank(b));
}

export type BookRangeResult = { ok: true; from: number; to: number; width: number } | { ok: false; error: string };

export function parseBookRange(fromInput: string, toInput: string, toLatin: (s: string) => string): BookRangeResult {
  const from = toLatin(fromInput).trim();
  const to = toLatin(toInput).trim();
  if (!/^\d+$/.test(from) || !/^\d+$/.test(to)) return { ok: false, error: 'اكتب أول وآخر رقم في الدفتر' };
  if (Number(to) < Number(from)) return { ok: false, error: 'آخر رقم لازم يكون أكبر من أول رقم' };
  return { ok: true, from: Number(from), to: Number(to), width: Math.max(from.length, to.length) };
}

export const formatChequeNumber = (number: number, width: number) => String(number).padStart(width, '0');
