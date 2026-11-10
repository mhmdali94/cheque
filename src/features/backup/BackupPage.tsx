import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { WrongPasswordError } from '@/backup/crypto';
import {
  applyMerge, BackupError, collectBackup, packBackup, planMerge, readBackupHeader, replaceAll, unpackBackup,
  type BackupData, type BackupFile, type MergePlan,
} from '@/backup/format';
import { decodeQrItem } from '@/backup/qr';
import { formatDateTime, todayIso } from '@/core/date';
import { formatNumber, toArabicDigits } from '@/core/digits';
import type { Cheque } from '@/core/types';
import { logAudit, newId, setSetting } from '@/db/repos';
import { db } from '@/db/schema';
import { isMobileDevice } from '@/print/deliver';
import { useCurrentCompany } from '@/state/useAppData';
import { Button, Notice, PageHeader, Select, TextInput } from '@/ui/controls';
import { downloadBlob } from '@/ui/download';

async function deliverBackup(text: string, filename: string): Promise<void> {
  const blob = new Blob([text], { type: 'application/json' });
  const file = new File([blob], filename, { type: 'application/json' });
  if (isMobileDevice() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (error) {
      if ((error as DOMException).name === 'AbortError') throw error;
    }
  }
  downloadBlob(blob, filename);
}

async function readQrFromImage(file: File): Promise<string> {
  const { default: jsQR } = await import('jsqr');
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  const result = jsQR(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
  if (!result) throw new Error('مش لاقي رمز واضح في الصورة. قرّب الكاميرا وصوّر تاني.');
  return result.data;
}

const fileButton = 'inline-flex min-h-11 w-fit cursor-pointer items-center rounded-md border border-rule-strong bg-surface px-4 text-sm font-semibold hover:bg-sunken focus-within:outline-2 focus-within:outline-accent';

export function BackupPage() {
  const { companies, company } = useCurrentCompany();
  const lastBackup = useLiveQuery(() => db.settings.get('lastBackupAt').then((e) => (e?.value as number) ?? 0), []);

  const [scope, setScope] = useState('current');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const [exportError, setExportError] = useState('');

  const [header, setHeader] = useState<BackupFile | null>(null);
  const [importPassword, setImportPassword] = useState('');
  const [data, setData] = useState<BackupData | null>(null);
  const [plan, setPlan] = useState<MergePlan | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [importError, setImportError] = useState('');
  const [importDone, setImportDone] = useState('');
  const [qrMessage, setQrMessage] = useState('');
  const [qrError, setQrError] = useState('');

  const exportBackup = async () => {
    setExportError('');
    setExportMessage('');
    if (password && password !== confirmPassword) { setExportError('كلمتين السر مش زي بعض'); return; }
    setBusy(true);
    try {
      const companyId = scope === 'all' ? null : company?.id ?? null;
      const text = await packBackup(await collectBackup(companyId), password || undefined);
      const label = companyId ? company?.name : 'كل الشركات';
      await deliverBackup(text, `نسخة شيكاتي ${label} ${toArabicDigits(todayIso())}.shikaty`);
      await setSetting('lastBackupAt', Date.now());
      setExportMessage('اتعملت النسخة. احتفظ بالملف في مكان أمين.');
      setPassword('');
      setConfirmPassword('');
    } catch (error) {
      if ((error as DOMException).name !== 'AbortError') setExportError('تعذر عمل النسخة الاحتياطية.');
    } finally {
      setBusy(false);
    }
  };

  const resetImport = () => {
    setHeader(null); setData(null); setPlan(null); setImportPassword(''); setConfirmReplace(false);
  };

  const prepare = async (file: BackupFile, secret?: string) => {
    try {
      const unpacked = await unpackBackup(file, secret);
      setData(unpacked);
      setPlan(await planMerge(unpacked));
      setImportError('');
    } catch (error) {
      if (error instanceof BackupError || error instanceof WrongPasswordError) setImportError(error.message);
      else setImportError('تعذر قراءة الملف.');
    }
  };

  const pickFile = async (file?: File) => {
    if (!file) return;
    resetImport();
    setImportDone('');
    setImportError('');
    try {
      const parsed = readBackupHeader(await file.text());
      setHeader(parsed);
      if (!parsed.encrypted) await prepare(parsed);
    } catch (error) {
      setImportError((error as Error).message);
    }
  };

  const merge = async () => {
    if (!plan) return;
    await applyMerge(plan);
    setImportDone(`تم الدمج: اتضاف ${formatNumber(plan.summary.newCheques)} شيك.`);
    resetImport();
  };

  const replace = async () => {
    if (!data) return;
    await replaceAll(data);
    setImportDone('تم استبدال كل البيانات بمحتوى الملف.');
    resetImport();
  };

  const receiveQr = async (file?: File) => {
    if (!file) return;
    setQrError('');
    setQrMessage('');
    try {
      const item = await decodeQrItem(await readQrFromImage(file));
      const now = Date.now();
      if (item.kind === 'template') {
        await db.templates.add({ ...item.template, id: newId(), builtin: false, createdAt: now, updatedAt: now });
        setQrMessage(`اتضاف القالب: ${item.template.name}`);
      } else {
        const known = await db.companies.get(item.cheque.companyId);
        if (!known) throw new Error('الشيك ده من شركة مش موجودة على الجهاز. انقل بيانات الشركة بملف نسخة احتياطية الأول.');
        const cheque: Cheque = { ...item.cheque, id: newId(), status: 'draft', number: null, printCount: 0, printedAt: undefined, createdAt: now, updatedAt: now };
        await db.cheques.add(cheque);
        await logAudit(cheque, 'create', 'مستلم برمز');
        setQrMessage('اتضاف الشيك للمسودات.');
      }
    } catch (error) {
      setQrError((error as Error).message);
    }
  };

  const summary = plan?.summary;

  return (
    <div className="flex max-w-2xl flex-col gap-10">
      <PageHeader title="النسخ الاحتياطي والنقل" description="احفظ بياناتك في ملف، أو انقلها لجهاز زميلك." />

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold">عمل نسخة</h2>
        <p className="text-ink-soft">
          {lastBackup ? `آخر نسخة: ${formatDateTime(lastBackup)}` : 'لسه ما عملتش أي نسخة احتياطية.'} البيانات موجودة على الجهاز ده بس، فالنسخة هي الحماية الوحيدة لو الجهاز ضاع أو البيانات اتمسحت.
        </p>
        <Select label="تشمل" value={scope} onChange={setScope}>
          <option value="current">الشركة الحالية فقط: {company?.name}</option>
          {(companies?.length ?? 0) > 1 && <option value="all">كل الشركات</option>}
        </Select>
        <TextInput label="كلمة سر للتشفير" type="password" autoComplete="new-password" value={password} onChange={setPassword} hint="موصى بيها لأن الملف فيه بيانات مالية. لو نسيتها الملف مش هيتفتح أبداً." />
        {password && <TextInput label="أعد كتابة كلمة السر" type="password" autoComplete="new-password" value={confirmPassword} onChange={setConfirmPassword} />}
        {exportError && <Notice tone="danger">{exportError}</Notice>}
        {exportMessage && <Notice tone="info">{exportMessage}</Notice>}
        <Button variant="primary" className="self-start" disabled={busy} onClick={() => void exportBackup()}>{busy ? 'جاري التجهيز...' : 'اعمل نسخة'}</Button>
      </section>

      <section className="flex flex-col gap-4 border-t border-rule pt-8">
        <h2 className="text-lg font-bold">استيراد ملف</h2>
        <label className={fileButton}>
          اختار ملف النسخة
          <input type="file" accept=".shikaty,application/json" className="sr-only" aria-label="ملف النسخة الاحتياطية" onChange={(e) => void pickFile(e.target.files?.[0])} />
        </label>
        {importDone && <Notice tone="info">{importDone}</Notice>}
        {importError && <Notice tone="danger">{importError}</Notice>}

        {header?.encrypted && !plan && (
          <div className="flex flex-col gap-3">
            <TextInput label="كلمة سر الملف" type="password" autoComplete="off" value={importPassword} onChange={setImportPassword} />
            <Button className="self-start" onClick={() => void prepare(header, importPassword)}>افتح الملف</Button>
          </div>
        )}

        {header && summary && plan && (
          <div className="flex flex-col gap-3">
            <p>الملف من {formatDateTime(header.createdAt)} ويشمل: {header.companyNames.join(' ، ')}</p>
            <Notice tone="info">
              هيتضاف {formatNumber(summary.newCheques)} شيك، وهيتحدث {formatNumber(summary.updatedCheques)}، و{formatNumber(summary.duplicateCheques)} مكررين هيتسابوا. شركات جديدة: {formatNumber(summary.newCompanies)}، قوالب جديدة: {formatNumber(summary.newTemplates)}.
            </Notice>
            {plan.numberConflicts > 0 && <Notice tone="warn">{formatNumber(plan.numberConflicts)} شيك برقم مستخدم في نفس الدفتر على الجهاز ده. راجعهم بعد الدمج.</Notice>}
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => void merge()}>ادمج مع بياناتي</Button>
              <Button variant="ghost" onClick={resetImport}>إلغاء</Button>
            </div>
            <div className="flex flex-col gap-2 border-t border-rule pt-3">
              <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-danger">
                <input type="checkbox" className="size-5 accent-[var(--danger)]" checked={confirmReplace} onChange={(e) => setConfirmReplace(e.target.checked)} />
                عايز أمسح كل بيانات الجهاز ده وأحط محتوى الملف مكانها
              </label>
              <Button variant="danger" className="self-start" disabled={!confirmReplace} onClick={() => void replace()}>استبدال الكل</Button>
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4 border-t border-rule pt-8">
        <h2 className="text-lg font-bold">استقبال برمز</h2>
        <p className="text-ink-soft">لقالب واحد أو شيك واحد. صوّر الرمز من شاشة زميلك.</p>
        <label className={fileButton}>
          صوّر الرمز
          <input type="file" accept="image/*" capture="environment" className="sr-only" aria-label="صورة الرمز" onChange={(e) => void receiveQr(e.target.files?.[0])} />
        </label>
        {qrError && <Notice tone="danger">{qrError}</Notice>}
        {qrMessage && <Notice tone="info">{qrMessage}</Notice>}
      </section>
    </div>
  );
}
