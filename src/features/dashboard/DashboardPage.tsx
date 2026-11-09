import { useMemo } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { addMonths, daysBetween, formatDate, todayIso } from '@/core/date';
import { formatNumber } from '@/core/digits';
import type { Cheque } from '@/core/types';
import { db } from '@/db/schema';
import { useCurrentCompany } from '@/state/useAppData';
import { EmptyState, PageHeader } from '@/ui/controls';

const WEEK_DAYS = 7;
const LIST_SIZE = 5;

function Row({ cheque }: { cheque: Cheque }) {
  return (
    <li className="flex items-baseline justify-between gap-4 py-2">
      <Link to={`/cheque/${cheque.id}`} className="truncate font-semibold hover:text-accent">{cheque.payee || 'بدون مستفيد'}</Link>
      <span className="shrink-0 text-sm text-ink-soft"><span dir="ltr">{formatDate(cheque.date)}</span></span>
      <span className="shrink-0 font-bold tabular-nums">{formatNumber(cheque.amount ?? 0)}</span>
    </li>
  );
}

export function DashboardPage() {
  const { company } = useCurrentCompany();
  const cheques = useLiveQuery(() => (company ? db.cheques.where('companyId').equals(company.id).toArray() : []), [company?.id]);

  const stats = useMemo(() => {
    const today = todayIso();
    const printed = (cheques ?? []).filter((c) => c.status === 'printed');
    const week = printed.filter((c) => c.printedAt !== undefined && Date.now() - c.printedAt < WEEK_DAYS * 86_400_000);

    const totals = new Map<string, number>();
    for (const c of printed) totals.set(c.payee, (totals.get(c.payee) ?? 0) + (c.amount ?? 0));

    return {
      week: week.sort((a, b) => (b.printedAt ?? 0) - (a.printedAt ?? 0)).slice(0, LIST_SIZE),
      weekTotal: week.reduce((sum, c) => sum + (c.amount ?? 0), 0),
      topPayees: [...totals].sort((a, b) => b[1] - a[1]).slice(0, LIST_SIZE),
      upcoming: printed.filter((c) => daysBetween(today, c.date) > 0 && c.date <= addMonths(today, 3)).sort((a, b) => a.date.localeCompare(b.date, 'ar-EG')).slice(0, LIST_SIZE),
      any: (cheques?.length ?? 0) > 0,
    };
  }, [cheques]);

  if (cheques && !stats.any) {
    return (
      <EmptyState title="لسه مفيش شيكات للشركة دي" action={<Link className="font-semibold text-accent underline" to="/cheque">اكتب أول شيك</Link>}>
        هنا هتلاقي شيكات الأسبوع، وأكبر المستفيدين، والشيكات المؤجلة الجاية.
      </EmptyState>
    );
  }

  const heading = 'mb-1 border-b border-rule pb-2 font-bold';
  const none = <p className="py-2 text-sm text-ink-soft">مفيش حاجة هنا دلوقتي.</p>;

  return (
    <>
      <PageHeader title="الرئيسية" />
      <div className="grid gap-10 lg:grid-cols-2">
        <section>
          <h2 className={heading}>مطبوع الأسبوع ده: {formatNumber(stats.weekTotal)} جنيه</h2>
          {stats.week.length ? <ul className="divide-y divide-rule">{stats.week.map((c) => <Row key={c.id} cheque={c} />)}</ul> : none}
        </section>
        <section>
          <h2 className={heading}>شيكات مؤجلة جاية</h2>
          {stats.upcoming.length ? <ul className="divide-y divide-rule">{stats.upcoming.map((c) => <Row key={c.id} cheque={c} />)}</ul> : none}
        </section>
        <section>
          <h2 className={heading}>أكبر المستفيدين</h2>
          {stats.topPayees.length ? (
            <ul className="divide-y divide-rule">
              {stats.topPayees.map(([payee, total]) => (
                <li key={payee} className="flex justify-between gap-4 py-2">
                  <span className="truncate font-semibold">{payee}</span>
                  <span className="shrink-0 font-bold tabular-nums">{formatNumber(total)}</span>
                </li>
              ))}
            </ul>
          ) : none}
        </section>
      </div>
    </>
  );
}
