import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { toLatinDigits } from '@/core/digits';
import { ChequePreview } from '@/features/preview/ChequePreview';
import { useCurrentCompany } from '@/state/useAppData';
import { Button, DigitInput, PageHeader, Select, TextInput } from '@/ui/controls';
import { addAccount, addBook, orderedTemplates, parseBookRange } from './data';

/** صفحة واحدة بتمشي المحاسب خطوة خطوة، وشكل الشيك قدامه وهو بيختار. */
export function AddAccountPage() {
  const { company } = useCurrentCompany();
  const navigate = useNavigate();
  // النسخ اليدوية مش بتستقبل تحديثات الأماكن، فمش بنعرضها هنا.
  const templates = useLiveQuery(async () => (await orderedTemplates()).filter((t) => !t.modelName.includes('(نسخة)')), []);

  const [bankName, setBankName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [label, setLabel] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');

  const banks = [...new Set(templates?.map((t) => t.bankName))];
  const bank = bankName || banks[0] || '';
  const models = templates?.filter((t) => t.bankName === bank) ?? [];
  const model = models.find((t) => t.id === templateId) ?? models[0];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!company || !model) return;
    const hasBook = from.trim() !== '' || to.trim() !== '';
    const range = hasBook ? parseBookRange(from, to, toLatinDigits) : null;
    if (range && !range.ok) { setError(range.error); return; }

    const account = await addAccount({
      companyId: company.id, bankName: bank, label: label.trim() || model.modelName,
      accountNumber: toLatinDigits(accountNumber).trim(), templateId: model.id,
    });
    if (range?.ok) {
      await addBook({ companyId: company.id, accountId: account.id, fromNumber: range.from, toNumber: range.to, numberWidth: range.width });
    }
    navigate('/accounts');
  };

  const stepTitle = 'mb-3 flex items-center gap-2 font-bold';
  const stepNumber = 'flex size-7 items-center justify-center rounded-full bg-accent-tint text-sm font-bold text-accent-strong';

  return (
    <>
      <PageHeader title="إضافة حساب بنكي" description={company ? `حساب جديد لشركة ${company.name}. لو عايز شركة تانية غيّرها من أعلى الشاشة.` : undefined} />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-8" noValidate>
          <fieldset>
            <legend className={stepTitle}><span className={stepNumber}>١</span>اختار البنك</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {banks.map((name) => (
                <label key={name} className="relative cursor-pointer">
                  <input
                    type="radio" name="bank" className="peer sr-only" checked={name === bank}
                    onChange={() => { setBankName(name); setTemplateId(''); }}
                  />
                  <span className="flex min-h-14 items-center rounded-md border border-rule-strong bg-surface px-4 font-semibold transition-colors duration-150 hover:bg-sunken peer-checked:border-accent peer-checked:bg-accent-tint peer-checked:text-accent-strong peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
                    {name}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-4">
            <legend className={stepTitle}><span className={stepNumber}>٢</span>طابق شكل الشيك</legend>
            <Select label="نموذج الشيك" value={model?.id ?? ''} onChange={setTemplateId} hint="اسم البنك لوحده مش كفاية. قارن الرسمة بورقة الشيك.">
              {models.map((t) => <option key={t.id} value={t.id}>{t.modelName}</option>)}
            </Select>
          </fieldset>

          <fieldset className="flex flex-col gap-4">
            <legend className={stepTitle}><span className={stepNumber}>٣</span>بيانات الحساب</legend>
            <TextInput label="اسم مميز للحساب" value={label} onChange={setLabel} hint="اختياري، عشان تفرّق بين الحسابات. مثلاً: حساب المرتبات." />
            <DigitInput label="رقم الحساب" value={accountNumber} onChange={setAccountNumber} hint="اختياري، للتأكيد قبل الطباعة." />
          </fieldset>

          <fieldset>
            <legend className={stepTitle}><span className={stepNumber}>٤</span>أول دفتر شيكات</legend>
            <div className="grid grid-cols-2 gap-3">
              <DigitInput label="أول رقم" value={from} onChange={setFrom} error={error} hint="المطبوع على أول ورقة." />
              <DigitInput label="آخر رقم" value={to} onChange={setTo} hint="المطبوع على آخر ورقة." />
            </div>
            <p className="mt-2 text-sm text-ink-soft">تقدر تسيبها فاضية وتضيف الدفتر بعدين.</p>
          </fieldset>

          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={!model}>حفظ الحساب</Button>
            <Button variant="ghost" onClick={() => navigate('/accounts')}>إلغاء</Button>
          </div>
        </form>

        {model && (
          <aside className="lg:sticky lg:top-32">
            <ChequePreview template={model} model={null} shaper={null} label={`شكل ${model.name}`} />
            <p className="mt-3 text-sm text-ink-soft">{model.name}</p>
          </aside>
        )}
      </div>
    </>
  );
}
