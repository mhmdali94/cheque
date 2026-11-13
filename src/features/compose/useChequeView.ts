import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { todayIso } from '@/core/date';
import { layoutCheque, type ChequeValues, type PrintModel } from '@/core/layout';
import type { BankAccount, Cheque, ChequeBook, ChequeTemplate, Company } from '@/core/types';
import { chequeWarnings, type Warning } from '@/core/warnings';
import { db } from '@/db/schema';
import { formatChequeNumber } from '@/features/companies/data';
import { useShaper } from '@/state/useAppData';
import type { Shaper } from '@/print/shaper';

export interface ChequeView {
  company?: Company;
  book?: ChequeBook;
  account?: BankAccount;
  template?: ChequeTemplate;
  shaper: Shaper | null;
  shaperError: boolean;
  model: PrintModel | null;
  warnings: Warning[];
  numberLabel?: string;
}

export function chequeValues(cheque: Cheque, company: Company): ChequeValues {
  return {
    payee: cheque.payee, amount: cheque.amount, piasters: cheque.piasters ?? 0, date: cheque.date, memo: cheque.memo,
    signatoryName: cheque.signatoryName, crossing: cheque.crossing, printStub: cheque.printStub,
    tafqeetPresetId: company.tafqeetPresetId, customPattern: company.customPattern,
    amountProtection: company.amountProtection,
  };
}

/** كل ما يُشتق من الشيك: القالب، نموذج الطباعة، والتحذيرات. */
export function useChequeView(cheque: Cheque | null): ChequeView {
  const { shaper, error: shaperError } = useShaper();
  const company = useLiveQuery(() => (cheque ? db.companies.get(cheque.companyId) : undefined), [cheque?.companyId]);
  const book = useLiveQuery(() => (cheque?.bookId ? db.books.get(cheque.bookId) : undefined), [cheque?.bookId]);
  const account = useLiveQuery(() => (cheque?.accountId ? db.accounts.get(cheque.accountId) : undefined), [cheque?.accountId]);
  const liveTemplate = useLiveQuery(() => (cheque?.templateId ? db.templates.get(cheque.templateId) : undefined), [cheque?.templateId]);
  const template = cheque?.templateSnapshot ?? liveTemplate;

  const isDuplicateNumber = useLiveQuery(async () => {
    if (!cheque?.bookId || cheque.number === null) return false;
    const match = await db.cheques.where({ bookId: cheque.bookId, number: cheque.number }).toArray();
    return match.some((c) => c.id !== cheque.id);
  }, [cheque?.id, cheque?.bookId, cheque?.number]) ?? false;

  const model = useMemo(() => {
    if (!cheque || !template || !company || !shaper) return null;
    return layoutCheque(template, chequeValues(cheque, company), shaper);
  }, [cheque, template, company, shaper]);

  const warnings = useMemo(() => {
    if (!cheque || !model) return [];
    return chequeWarnings({
      model, date: cheque.date, today: todayIso(), amount: cheque.amount, piasters: cheque.piasters ?? 0, amountLimit: company?.amountLimit,
      number: cheque.number, isDuplicateNumber,
      bookRange: book ? { from: book.fromNumber, to: book.toNumber } : undefined,
    });
  }, [cheque, model, company?.amountLimit, book, isDuplicateNumber]);

  const numberLabel = cheque?.number != null && book ? formatChequeNumber(cheque.number, book.numberWidth) : undefined;

  return { company, book, account, template, shaper, shaperError, model, warnings, numberLabel };
}
