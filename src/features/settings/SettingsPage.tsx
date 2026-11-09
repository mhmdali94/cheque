import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getSetting, setSetting } from '@/db/repos';
import { db } from '@/db/schema';
import { PageHeader, Select, TextInput } from '@/ui/controls';

const THEME_KEY = 'shikaty-theme';

function applyTheme(theme: string) {
  if (theme === 'dark') document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* المتصفح مانع التخزين */ }
}

export function SettingsPage() {
  const [name, setName] = useState('');
  const ink = useLiveQuery(() => getSetting('previewInk', 'blue'), []) ?? 'blue';
  const theme = useLiveQuery(() => getSetting('theme', 'light'), []) ?? 'light';

  useEffect(() => { void db.settings.get('accountantName').then((e) => setName((e?.value as string) ?? '')); }, []);

  return (
    <div className="flex max-w-md flex-col gap-5">
      <PageHeader title="الإعدادات" />
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
    </div>
  );
}
