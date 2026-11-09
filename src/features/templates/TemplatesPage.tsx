import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { toArabicDigits } from '@/core/digits';
import { ACCURACY_LABEL } from '@/core/templates';
import type { ChequeTemplate } from '@/core/types';
import { orderedTemplates } from '@/features/companies/data';
import { Button, Notice, PageHeader, TextInput } from '@/ui/controls';
import { QrPanel } from '@/features/backup/QrPanel';
import { createTemplateFor, duplicateTemplate, exportTemplate, importTemplateFile } from './data';

export function TemplatesPage() {
  const templates = useLiveQuery(() => orderedTemplates(), []);
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [newBank, setNewBank] = useState('');
  const [newModel, setNewModel] = useState('');
  const [addError, setAddError] = useState('');
  const [qr, setQr] = useState<ChequeTemplate | null>(null);
  const qrItem = useMemo(() => (qr ? { kind: 'template' as const, template: qr } : null), [qr]);

  const addTemplate = async (event: FormEvent) => {
    event.preventDefault();
    const base = templates?.[0];
    if (!newBank.trim() || !newModel.trim()) { setAddError('اكتب اسم البنك واسم النموذج'); return; }
    if (!base) return;
    const created = await createTemplateFor(base, newBank.trim(), newModel.trim());
    navigate(`/templates/${created.id}/measure`);
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    setError('');
    try {
      const template = await importTemplateFile(await file.text());
      navigate(`/templates/${template.id}`);
    } catch (e) {
      setError(e instanceof SyntaxError ? 'الملف ده مش قالب شيكاتي صالح' : (e as Error).message);
    }
  };

  const banks = new Map<string, ChequeTemplate[]>();
  templates?.forEach((t) => banks.set(t.bankName, [...(banks.get(t.bankName) ?? []), t]));

  return (
    <>
      <PageHeader title="قوالب الشيكات">
        <Link className="flex min-h-11 items-center font-semibold text-accent underline" to="/templates/compare">قارن شيكك بالنماذج</Link>
        <Button onClick={() => fileRef.current?.click()}>استيراد قالب</Button>
        <input ref={fileRef} type="file" accept=".json,application/json" className="sr-only" aria-label="ملف القالب" tabIndex={-1} onChange={(e) => void importFile(e.target.files?.[0])} />
      </PageHeader>
      {error && <div className="mb-4"><Notice tone="danger">{error}</Notice></div>}
      {qr && qrItem && <QrPanel item={qrItem} label={`نقل قالب ${qr.name}`} onClose={() => setQr(null)} />}
      <p className="mb-6 max-w-2xl text-ink-soft">اسم البنك لوحده مش كفاية: طابق شكل الورقة. البنك الواحد عنده أكتر من نموذج متداول في نفس الوقت.</p>

      <form onSubmit={(e) => void addTemplate(e)} className="mb-8 grid max-w-2xl items-start gap-3 sm:grid-cols-[1fr_1fr_auto]" noValidate>
        <TextInput label="بنك جديد أو موجود" value={newBank} onChange={setNewBank} error={addError} />
        <TextInput label="اسم النموذج" value={newModel} onChange={setNewModel} />
        <Button type="submit" className="sm:mt-6">إضافة قالب</Button>
      </form>

      <div className="flex flex-col gap-8">
        {[...banks].map(([bank, list]) => (
          <section key={bank}>
            <h2 className="text-lg font-bold">{bank}</h2>
            <ul className="mt-2 divide-y divide-rule border-y border-rule">
              {list.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                  <Link to={`/templates/${t.id}`} className="min-w-48 flex-1 font-semibold hover:text-accent">
                    {t.modelName}
                    <span className={`block text-sm font-normal ${t.accuracy === 'adjusted' ? 'text-accent' : 'text-warn'}`}>
                      {ACCURACY_LABEL[t.accuracy]} ، {toArabicDigits(t.widthMm)} × {toArabicDigits(t.lengthMm)} مم
                    </span>
                  </Link>
                  <Button variant="ghost" onClick={() => setQr(t)}>رمز</Button>
                  <Button variant="ghost" onClick={() => void exportTemplate(t)}>تصدير</Button>
                  <Button variant="ghost" onClick={() => void duplicateTemplate(t).then((copy) => navigate(`/templates/${copy.id}`))}>نسخة</Button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
