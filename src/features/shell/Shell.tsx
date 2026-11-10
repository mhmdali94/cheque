import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { toArabicDigits } from '@/core/digits';
import { db } from '@/db/schema';
import { useCurrentCompany } from '@/state/useAppData';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

/** مسار الشغل الأساسي بالترتيب، وبعده باقي الأدوات. */
const MAIN_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'الرئيسية' },
  { to: '/accounts', label: 'الحسابات البنكية', end: true },
  { to: '/accounts/new', label: 'إضافة حساب' },
  { to: '/cheque', label: 'كتابة شيك' },
];

const TOOL_ITEMS: NavItem[] = [
  { to: '/drafts', label: 'المسودات' },
  { to: '/history', label: 'السجل' },
  { to: '/batch', label: 'دفعة من إكسل' },
  { to: '/templates', label: 'قوالب الشيكات' },
  { to: '/printer', label: 'الطابعة والمعايرة' },
  { to: '/backup', label: 'النسخ الاحتياطي' },
  { to: '/settings', label: 'الإعدادات' },
];

function NavEntry({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to} end={item.end}
      className={({ isActive }) =>
        `relative flex h-11 shrink-0 items-center whitespace-nowrap px-3 text-sm font-semibold transition-colors duration-150 ${
          isActive
            ? 'text-accent-strong after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent'
            : 'text-ink-soft hover:text-ink'
        }`
      }
    >
      {item.label}
    </NavLink>
  );
}

function CompanyBand() {
  const { companies, company, selectCompany } = useCurrentCompany();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const change = async (id: string) => {
    await selectCompany(id);
    // المسودة المفتوحة تخص الشركة السابقة، فنبدأ شيك جديد للشركة المختارة.
    if (pathname.startsWith('/cheque')) navigate('/cheque');
  };

  return (
    <div className="flex h-13 items-center gap-3 px-4 text-white" style={{ background: company?.color }}>
      <Link to="/dashboard" className="text-lg font-bold">شيكاتي</Link>
      <label className="ms-auto flex items-center gap-2 text-sm font-semibold">
        <span>الشركة</span>
        <select
          dir="rtl" value={company?.id ?? ''} onChange={(e) => void change(e.target.value)}
          className="min-h-10 max-w-[55vw] rounded-md border border-white/40 bg-white/15 px-2 font-bold text-white [&>option]:text-black"
        >
          {companies?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
    </div>
  );
}

const BACKUP_REMIND_DAYS = 3;

function BackupReminder() {
  const state = useLiveQuery(async () => ({
    last: ((await db.settings.get('lastBackupAt'))?.value as number) ?? 0,
    count: await db.cheques.count(),
  }), []);
  if (!state || state.count === 0) return null;
  const days = state.last ? Math.floor((Date.now() - state.last) / 86_400_000) : null;
  if (days !== null && days < BACKUP_REMIND_DAYS) return null;
  return (
    <p className="mb-4 rounded-md bg-warn-tint px-3 py-2 text-sm font-semibold text-warn">
      {days === null ? 'لسه ما عملتش نسخة احتياطية.' : `آخر نسخة احتياطية من ${toArabicDigits(days)} أيام.`}{' '}
      <Link className="underline" to="/backup">اعمل نسخة</Link>
    </p>
  );
}

export function Shell() {
  const navRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();

  // على الموبايل القائمة بتتحرك بالعرض، فالصفحة الحالية لازم تفضل ظاهرة.
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [pathname]);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40">
        <CompanyBand />
        <nav ref={navRef} aria-label="القائمة الرئيسية" className="no-scrollbar flex overflow-x-auto border-b border-rule bg-surface px-2">
          {MAIN_ITEMS.map((item) => <NavEntry key={item.to} item={item} />)}
          <span aria-hidden className="mx-2 my-3 w-px shrink-0 bg-rule-strong" />
          {TOOL_ITEMS.map((item) => <NavEntry key={item.to} item={item} />)}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 lg:px-8"><BackupReminder /><Outlet /></main>
    </div>
  );
}
