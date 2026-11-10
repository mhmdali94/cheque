import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { addMonths, dateCells, daysBetween, formatDate, formatDateLong, todayIso } from '@/core/date';
import { formatNumber, MAX_AMOUNT } from '@/core/digits';
import { resolveTafqeetOptions, tafqeet } from '@/core/tafqeet';
import type { Cheque } from '@/core/types';
import { remainingInBook } from '@/db/repos';
import { db } from '@/db/schema';
import { useCurrentCompany } from '@/state/useAppData';
import { AppBanner } from '@/ui/AppBanner';

const WEEK_MS = 7 * 86_400_000;
const LIST_SIZE = 5;
const LOW_BOOK_THRESHOLD = 5;

function StripLink({ to, value, label, alert }: { to: string; value: number; label: string; alert?: boolean }) {
  return (
    <Link to={to} className="flex items-baseline gap-2 py-1 hover:underline">
      <span className={`text-lg font-bold tabular-nums ${alert && value > 0 ? 'text-warn' : ''}`}>{formatNumber(value)}</span>
      <span className="text-sm">{label}</span>
    </Link>
  );
}

function Row({ cheque }: { cheque: Cheque }) {
  return (
    <li className="flex items-baseline justify-between gap-4 py-2">
      <Link to={`/cheque/${cheque.id}`} className="truncate font-semibold hover:text-accent">{cheque.payee || 'بدون مستفيد'}</Link>
      <span className="shrink-0 text-sm text-ink-soft"><span dir="ltr">{formatDate(cheque.date)}</span></span>
      <span className="shrink-0 font-bold tabular-nums">{formatNumber(cheque.amount ?? 0)}</span>
    </li>
  );
}

const HELP_TOPICS: { question: string; answer: ReactNode }[] = [
  {
    question: 'إزاي أضيف أو أعدّل شركة؟',
    answer: <>من <Link className="underline" to="/companies">الشركات</Link> تقدر تضيف شركة جديدة أو تعدّل اسمها ولونها. بعد إضافة الشركة بنكمّل على طول بإضافة حسابها البنكي ودفتر الشيكات.</>,
  },
  {
    question: 'إزاي أكتب شيك؟',
    answer: <>افتح <Link className="underline" to="/cheque">كتابة شيك</Link>، واكتب المستفيد والمبلغ. التفقيط بيتكتب لوحده، والشيك بيتحفظ تلقائياً مع كل حرف. بعدها اضغط «راجع واطبع».</>,
  },
  {
    question: 'إزاي أحط الشيك في الطابعة؟',
    answer: <>في الدرج الأمامي، بالطول، والوش لفوق، وحافة الشعار هي اللي تدخل الأول، واقفل الموجّهين عليه. الخطوات مرسومة في <Link className="underline" to="/printer">الطابعة والمعايرة</Link>.</>,
  },
  {
    question: 'الكلام طلع مش في مكانه، أعمل إيه؟',
    answer: <>جرّب دايماً على ورقة مقصوصة الأول. لو الكلام كله مزحوح استخدم أزرار «الكلام طلع فين؟» في <Link className="underline" to="/printer">الطابعة والمعايرة</Link>. لو حقل واحد بس هو اللي غلط، حرّكه من <Link className="underline" to="/templates">قوالب الشيكات</Link>.</>,
  },
  {
    question: 'بعد الطباعة بيحصل إيه؟',
    answer: <>التطبيق بيسألك الشيك طلع سليم ولا تالف. السليم بيتقفل ويتسجل في <Link className="underline" to="/history">السجل</Link>، والتالف بيتسجل ويجهّزلك نفس الشيك بالرقم التالي.</>,
  },
  {
    question: 'إزاي أنقل البيانات لجهاز تاني؟',
    answer: <>البيانات موجودة على الجهاز ده بس. اعمل ملف من <Link className="underline" to="/backup">النسخ الاحتياطي</Link> وافتحه على الجهاز التاني. ويفضل تعمل نسخة بانتظام.</>,
  },
];

export function DashboardPage() {
  const { company } = useCurrentCompany();

  const data = useLiveQuery(async () => {
    if (!company) return null;
    const [cheques, accounts, books, name, lastBackup, trials] = await Promise.all([
      db.cheques.where('companyId').equals(company.id).toArray(),
      db.accounts.where('companyId').equals(company.id).count(),
      db.books.where('companyId').equals(company.id).toArray(),
      db.settings.get('accountantName'),
      db.settings.get('lastBackupAt'),
      db.settings.where('key').startsWith('trial:').toArray(),
    ]);
    const remaining = await Promise.all(books.map((book) => remainingInBook(book)));
    return {
      cheques, accounts, bookCount: books.length,
      lowBooks: remaining.filter((n) => n <= LOW_BOOK_THRESHOLD).length,
      accountant: (name?.value as string) ?? '',
      backedUp: Boolean(lastBackup?.value),
      trialDone: trials.some((t) => t.value === true),
    };
  }, [company?.id]);

  const stats = useMemo(() => {
    const today = todayIso();
    const cheques = data?.cheques ?? [];
    const printed = cheques.filter((c) => c.status === 'printed');
    const week = printed.filter((c) => c.printedAt !== undefined && Date.now() - c.printedAt < WEEK_MS);

    const totals = new Map<string, number>();
    for (const c of printed) totals.set(c.payee, (totals.get(c.payee) ?? 0) + (c.amount ?? 0));
    const upcomingAll = printed.filter((c) => daysBetween(today, c.date) > 0 && c.date <= addMonths(today, 3));

    return {
      week: week.sort((a, b) => (b.printedAt ?? 0) - (a.printedAt ?? 0)).slice(0, LIST_SIZE),
      weekCount: week.length,
      weekTotal: week.reduce((sum, c) => sum + (c.amount ?? 0), 0),
      topPayees: [...totals].sort((a, b) => b[1] - a[1]).slice(0, LIST_SIZE),
      upcoming: [...upcomingAll].sort((a, b) => a.date.localeCompare(b.date, 'ar-EG')).slice(0, LIST_SIZE),
      upcomingCount: upcomingAll.length,
      drafts: cheques.filter((c) => c.status === 'draft').length,
      printedCount: printed.length,
      any: cheques.length > 0,
    };
  }, [data]);

  if (!data || !company) return null;

  const words = stats.weekTotal >= 1 && stats.weekTotal <= MAX_AMOUNT
    ? tafqeet(stats.weekTotal, resolveTafqeetOptions(company.tafqeetPresetId, company.customPattern))
    : 'لسه مفيش شيكات مطبوعة الأسبوع ده';

  const steps = [
    { title: 'سجّل حساب ودفتر', detail: 'البنك، شكل الشيك، وأرقام الدفتر.', to: data.bookCount > 0 ? '/accounts' : '/accounts/new', done: data.accounts > 0 && data.bookCount > 0 },
    { title: 'جهّز الطابعة', detail: 'الاتجاه، المعايرة، وتجربة على ورقة مقصوصة.', to: '/printer', done: data.trialDone },
    { title: 'اكتب أول شيك', detail: 'المستفيد والمبلغ، والباقي بيتملى لوحده.', to: '/cheque', done: stats.any },
    { title: 'راجع واطبع', detail: 'قارن الأرقام بالحروف قبل الورقة الأصلية.', to: stats.any ? '/drafts' : '/cheque', done: stats.printedCount > 0 },
    { title: 'اعمل نسخة احتياطية', detail: 'بياناتك على الجهاز ده بس.', to: '/backup', done: data.backedUp },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;

  const heading = 'mb-1 border-b border-rule pb-2 font-bold';
  const none = <p className="py-2 text-sm text-ink-soft">مفيش حاجة هنا دلوقتي.</p>;

  return (
    <div className="flex flex-col gap-10">
      <AppBanner />

      <header>
        <h1 className="text-2xl font-bold">أهلاً{data.accountant && `، ${data.accountant}`}</h1>
        <p className="text-ink-soft">{formatDateLong(todayIso())}</p>
      </header>

      {/* ملخص الأسبوع مكتوب كأنه شيك */}
      <section aria-label="ملخص الأسبوع" className="cheque-card overflow-hidden rounded-lg border border-rule">
        <div className="p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-ink-soft">كشف الأسبوع</p>
              <p className="text-lg font-bold">{company.name}</p>
            </div>
            <div dir="ltr" aria-label={`تاريخ النهارده ${formatDate(todayIso())}`} className="flex">
              {dateCells(todayIso()).map((digit, index) => (
                <span key={index} aria-hidden className="flex size-7 items-center justify-center border border-rule-strong bg-surface text-sm font-bold tabular-nums first:rounded-s last:rounded-e [&:not(:first-child)]:border-s-0">{digit}</span>
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
            <div className="min-w-0 flex-1 basis-72">
              <p className="text-sm text-ink-soft">مطبوع الأسبوع ده ({formatNumber(stats.weekCount)} شيك)</p>
              <p className="mt-1 border-b border-dashed border-rule-strong pb-1 text-lg font-semibold">{words}</p>
            </div>
            <p className="shrink-0 rounded-md border border-rule-strong bg-surface px-4 py-2 text-2xl font-bold tabular-nums">
              {formatNumber(stats.weekTotal)} <span className="text-sm font-semibold">جنيه</span>
            </p>
          </div>

          <div className="mt-6 flex justify-end">
            <Link to="/cheque" className="flex min-h-12 items-center rounded-md bg-accent px-6 font-bold text-on-accent transition-colors duration-150 hover:bg-accent-strong">اكتب شيك جديد</Link>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-1 bg-sunken px-5 py-2 sm:px-7">
          <StripLink to="/drafts" value={stats.drafts} label="مسودات مستنية" />
          <StripLink to="/history" value={stats.upcomingCount} label="شيكات مؤجلة" />
          <StripLink to="/accounts" value={data.lowBooks} label="دفاتر قربت تخلص" alert />
          <StripLink to="/history" value={stats.printedCount} label="مطبوع إجمالي" />
        </div>
      </section>

      <section aria-labelledby="start-title">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 id="start-title" className="text-lg font-bold">{allDone ? 'كل خطوات البداية خلصت' : 'ابدأ من هنا'}</h2>
          <p className="text-sm text-ink-soft">{formatNumber(doneCount)} من {formatNumber(steps.length)}</p>
        </div>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map((step, index) => (
            <li key={step.title}>
              <Link to={step.to} className={`flex h-full flex-col gap-1 rounded-md border p-3 transition-colors duration-150 ${step.done ? 'border-rule bg-sunken' : 'border-rule-strong bg-surface hover:bg-sunken'}`}>
                <span className={`flex size-7 items-center justify-center rounded-full text-sm font-bold ${step.done ? 'bg-accent text-on-accent' : 'bg-accent-tint text-accent-strong'}`}>
                  {step.done ? <span aria-label="تم">✓</span> : formatNumber(index + 1)}
                </span>
                <span className="mt-1 font-bold">{step.title}</span>
                <span className="text-sm text-ink-soft">{step.detail}</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-10 lg:grid-cols-3">
        <section>
          <h2 className={heading}>مطبوع مؤخراً</h2>
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

      <section aria-labelledby="help-title">
        <h2 id="help-title" className="mb-2 text-lg font-bold">إزاي أستخدم التطبيق؟</h2>
        <div className="divide-y divide-rule border-y border-rule">
          {HELP_TOPICS.map((topic) => (
            <details key={topic.question} className="group">
              <summary className="flex min-h-12 items-center justify-between gap-3 font-semibold [&::-webkit-details-marker]:hidden">
                {topic.question}
                <span aria-hidden className="text-ink-soft transition-transform duration-150 group-open:rotate-45">+</span>
              </summary>
              <p className="max-w-2xl pb-4 text-ink-soft">{topic.answer}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
