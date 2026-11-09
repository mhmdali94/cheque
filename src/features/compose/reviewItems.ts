import { layoutCheque } from '@/core/layout';
import type { Cheque } from '@/core/types';
import { db } from '@/db/schema';
import { formatChequeNumber } from '@/features/companies/data';
import type { ReviewItem } from '@/print/reviewCopy';
import type { Shaper } from '@/print/shaper';
import { chequeValues } from './useChequeView';

/** عنصر جاهز لنسخة المراجعة، بنفس قالب الشيك وقت طباعته لو اتطبع. */
export async function buildReviewItem(cheque: Cheque, shaper: Shaper): Promise<ReviewItem | null> {
  const [company, liveTemplate, book] = await Promise.all([
    db.companies.get(cheque.companyId), db.templates.get(cheque.templateId), db.books.get(cheque.bookId),
  ]);
  const template = cheque.templateSnapshot ?? liveTemplate;
  if (!company || !template) return null;
  const photo = template.imageId ? (await db.images.get(template.imageId))?.data : undefined;
  return {
    template, photo,
    model: layoutCheque(template, chequeValues(cheque, company), shaper),
    chequeNumber: cheque.number !== null && book ? formatChequeNumber(cheque.number, book.numberWidth) : undefined,
  };
}
