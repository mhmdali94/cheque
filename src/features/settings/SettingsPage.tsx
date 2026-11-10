import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { getSetting, setSetting } from '@/db/repos';
import { db } from '@/db/schema';
import { Button, Notice, PageHeader, Select, TextInput } from '@/ui/controls';
import { formatDateTime } from '@/core/date';
import { formatNumber } from '@/core/digits';
import { eraseDevice } from './eraseDevice';
import { forceUpdate } from './forceUpdate';

const THEME_KEY = 'shikaty-theme';
const ERASE_WORD = 'امسح';

function applyTheme(theme: string) {
  if (theme === 'dark') document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* المتصفح مانع التخزين */ }
}

export function SettingsPage() {
  const [name, setName] = useState('');
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const [erasing, setErasing] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [eraseBusy, setEraseBusy] = useState(false);
  const [eraseError, setEraseError] = useState('');
  const chequeCount = useLiveQuery(() => db.cheques.count(), []) ?? 0;
  const lastBackup = useLiveQuery(() => getSetting('lastBackupAt', 0), []) ?? 0;
  const ink = useLiveQuery(() => getSetting('previewInk', 'blue'), []) ?? 'blue';
  const theme = useLiveQuery(() => getSetting('theme', 'light'), []) ?? 'light';

  const runErase = async () => {
    setEraseBusy(true);
    setEraseError('');
    try {
      await eraseDevice();
    } catch {
      setEraseError('تعذر المسح. اقفل أي تبويب تاني مفتوح فيه التطبيق وجرّب تاني.');
      setEraseBusy(false);
    }
  };

  const runUpdate = async () => {
    setUpdating(true);
    setUpdateError('');
    try {
      if ((await forceUpdate()) === 'offline') {
        setUpdateError('مفيش اتصال بالموقع دلوقتي. اتصل بالإنترنت وجرّب تاني.');
        setUpdating(false);
      }
    } catch {
      setUpdateError('تعذر التحديث. أعد فتح الصفحة وجرّب تاني.');
      setUpdating(false);
    }
  };

  useEffect(() => { void db.settings.get('accountantName').then((e) => setName((e?.value as string) ?? '')); }, []);

  return (
    <div className="flex max-w-md flex-col gap-5">
      <PageHeader title="الإعدادات" description="إعدادات الجهاز ده بس." />
      <TextInput
        label="اسم المحاسب على الجهاز ده" value={name} hint="بيظهر في السجل ونسخة المراجعة."
        onChange={(v) => { setName(v); void setSetting('accountantName', v.trim()); }}
      />
      <Select label="المظهر" value={theme} onChange={(v) => { applyTheme(v); void setSetting('theme', v); }}>
        <option value="light">فاتح</option><option value="dark">داكن</option>
      </Select>
      <Select label="لون الحبر في المعاينة" value={ink} onChange={(v) => void setSetting('previewInk', v)} hint="الطباعة على الشيك دايماً بالأسود.">
        <option value="blue">أزرق</option><option value="black">أسود</option>
      </Select>

      <section className="flex flex-col gap-3 border-t border-rule pt-5">
        <h2 className="font-bold">تحديث التطبيق</h2>
        <p className="text-sm text-ink-soft">
          الإصدار الحالي: {formatDateTime(__BUILD_TIME__)}. استخدم الزر لو نزل تحديث وما ظهرش عندك. الشيكات والبيانات مش هتتمسح.
        </p>
        {updateError && <Notice tone="danger">{updateError}</Notice>}
        <Button className="self-start" disabled={updating} onClick={() => void runUpdate()}>
          {updating ? 'جاري التحديث...' : 'تحديث التطبيق'}
        </Button>
      </section>

      <section className="flex flex-col gap-3 border-t border-rule pt-5">
        <h2 className="font-bold">مسح كل البيانات</h2>
        <p className="text-sm text-ink-soft">يرجّع الجهاز ده زي أول مرة. أجهزة زملائك مش هتتأثر.</p>
        {!erasing ? (
          <Button variant="danger" className="self-start" onClick={() => setErasing(true)}>مسح كل البيانات</Button>
        ) : (
          <div className="flex flex-col gap-3 rounded-md border border-danger p-4">
            <Notice tone="danger">
              هيتمسح نهائياً من الجهاز ده: {formatNumber(chequeCount)} شيك، والشركات والحسابات والدفاتر والسجل، وتعديلات القوالب والمعايرة. مفيش رجوع بعد كده.
            </Notice>
            <p className="text-sm">
              {lastBackup ? `آخر نسخة احتياطية: ${formatDateTime(lastBackup)}.` : 'لسه ما عملتش أي نسخة احتياطية.'}{' '}
              <Link className="font-semibold text-accent underline" to="/backup">اعمل نسخة الأول</Link>
            </p>
            <TextInput label={`اكتب كلمة «${ERASE_WORD}» للتأكيد`} value={confirmText} onChange={setConfirmText} autoComplete="off" />
            {eraseError && <Notice tone="danger">{eraseError}</Notice>}
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" disabled={confirmText.trim() !== ERASE_WORD || eraseBusy} onClick={() => void runErase()}>
                {eraseBusy ? 'جاري المسح...' : 'امسح كل حاجة نهائياً'}
              </Button>
              <Button variant="ghost" onClick={() => { setErasing(false); setConfirmText(''); }}>إلغاء</Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
