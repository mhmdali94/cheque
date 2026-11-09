import { todayIso } from '@/core/date';
import type { Cheque } from '@/core/types';
import { logAudit, newId, nextChequeNumber } from '@/db/repos';
import { db } from '@/db/schema';

/** شيك جديد بنفس البيانات ورقم الدفتر التالي، للمدفوعات المتكررة وبدل التالف. */
export async function createSimilarCheque(source: Cheque): Promise<Cheque> {
  const book = await db.books.get(source.bookId);
  const now = Date.now();
  const copy: Cheque = {
    ...source,
    id: newId(),
    status: 'draft',
    number: book ? await nextChequeNumber(book) : null,
    date: todayIso(),
    templateSnapshot: undefined,
    printedAt: undefined,
    printCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  await db.cheques.add(copy);
  await logAudit(copy, 'create', 'شيك مشابه');
  return copy;
}
