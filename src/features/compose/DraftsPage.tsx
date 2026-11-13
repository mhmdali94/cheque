import { useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatDate, formatDateTime } from '@/core/date';
import { formatMoney, toArabicDigits } from '@/core/digits';
import type { Cheque } from '@/core/types';
import { logAudit } from '@/db/repos';
import { db } from '@/db/schema';
import { useCurrentCompany } from '@/state/useAppData';
import { Button, EmptyState, PageHeader } from '@/ui/controls';

export function DraftsPage() {
  const { company, companies } = useCurrentCompany();
  const [allCompanies, setAllCompanies] = useState(false);

  const drafts = useLiveQuery(async () => {
    const rows = await db.cheques.where('status').equals('draft').toArray();
    return rows
      .filter((c) => allCompanies || c.companyId === company?.id)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [allCompanies, company?.id]);

  const cancel = async (cheque: Cheque) => {
    await db.cheques.update(cheque.id, { status: 'cancelled', updatedAt: Date.now() });
    await logAudit(cheque, 'cancel');
  };

  const companyName = (id: string) => companies?.find((c) => c.id === id)?.name;

  return (
    <>
      <PageHeader title="المسودات" description="الشيكات اللي لسه ما اتطبعتش. افتح أي واحد وكمّله من مكان ما وقفت.">
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={allCompanies} onChange={(e) => setAllCompanies(e.target.checked)} />
          كل الشركات
        </label>
      </PageHeader>

      {drafts?.length === 0 && (
        <EmptyState title="مفيش مسودات" action={<Link className="font-semibold text-accent underline" to="/cheque">اكتب شيك</Link>}>
          أي شيك بتكتبه بيتحفظ هنا تلقائياً مع كل تعديل، فتقدر تقفل وترجع تكمله.
        </EmptyState>
      )}

      <ul className="divide-y divide-rule">
        {drafts?.map((draft) => (
          <li key={draft.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 py-3">
            <Link to={`/cheque/${draft.id}`} className="min-w-48 flex-1 font-semibold hover:text-accent">
              {draft.payee || 'بدون مستفيد'}
              <span className="block text-sm font-normal text-ink-soft">
                {allCompanies && `${companyName(draft.companyId)} ، `}
                {draft.number !== null && `رقم ${toArabicDigits(draft.number)} ، `}
                <span dir="ltr">{formatDate(draft.date)}</span> ، آخر تعديل {formatDateTime(draft.updatedAt)}
              </span>
            </Link>
            <p className="font-bold tabular-nums">{draft.amount !== null ? `${formatMoney(draft.amount, draft.piasters)} جنيه` : 'بدون مبلغ'}</p>
            <Button variant="ghost" onClick={() => void cancel(draft)}>إلغاء</Button>
          </li>
        ))}
      </ul>
    </>
  );
}
