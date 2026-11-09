import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { toArabicDigits } from '@/core/digits';
import { db } from '@/db/schema';
import { useCurrentCompany } from '@/state/useAppData';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'الرئيسية' },
  { to: '/cheque', label: 'كتابة شيك' },
  { to: '/batch', label: 'دفعة من إكسل' },
  { to: '/drafts', label: 'المسودات' },
  { to: '/history', label: 'السجل' },
  { to: '/companies', label: 'الشركات والدفاتر' },
  { to: '/templates', label: 'قوالب الشيكات' },
  { to: '/printer', label: 'الطابعة والمعايرة' },
  { to: '/backup', label: 'النسخ الاحتياطي' },
  { to: '/settings', label: 'الإعدادات' },
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="القائمة الرئيسية" className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to} to={item.to} onClick={onNavigate}
          className={({ isActive }) =>
            `flex min-h-11 items-center rounded-md px-3 text-sm font-semibold transition-colors duration-150 ${
              isActive ? 'bg-accent-tint text-accent-strong' : 'text-ink-soft hover:bg-sunken hover:text-ink'
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

function CompanyBand({ onMenu }: { onMenu: () => void }) {
  const { companies, company, selectCompany } = useCurrentCompany();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const change = async (id: string) => {
    await selectCompany(id);
    // المسودة المفتوحة تخص الشركة السابقة، فنبدأ شيك جديد للشركة المختارة.
    if (pathname.startsWith('/cheque')) navigate('/cheque');
  };

  return (
    <div className="sticky top-0 z-40 flex min-h-13 items-center gap-3 px-4 text-white" style={{ background: company?.color }}>
      <button type="button" className="min-h-11 rounded-md px-2 text-sm font-semibold hover:bg-white/15 lg:hidden" onClick={onMenu}>
        القائمة
      </button>
      <p className="hidden text-lg font-bold lg:block">شيكاتي</p>
      <label className="ms-auto flex items-center gap-2 text-sm font-semibold">
        <span>الشركة</span>
        <select
          dir="rtl" value={company?.id ?? ''} onChange={(e) => void change(e.target.value)}
          className="min-h-11 max-w-[60vw] rounded-md border border-white/40 bg-white/15 px-2 font-bold text-white [&>option]:text-black"
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
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="min-h-dvh">
      <CompanyBand onMenu={() => setMenuOpen(!menuOpen)} />
      {menuOpen && (
        <div className="border-b border-rule bg-surface p-3 lg:hidden"><NavItems onNavigate={() => setMenuOpen(false)} /></div>
      )}
      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="sticky top-13 hidden h-[calc(100dvh-3.25rem)] border-e border-rule p-3 lg:block"><NavItems /></aside>
        <main className="min-w-0 px-4 py-6 lg:px-8"><BackupReminder /><Outlet /></main>
      </div>
    </div>
  );
}
