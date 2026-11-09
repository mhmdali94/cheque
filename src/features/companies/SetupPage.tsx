import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toLatinDigits } from '@/core/digits';
import { setSetting } from '@/db/repos';
import { db } from '@/db/schema';
import { Button, DigitInput, Select, TextInput } from '@/ui/controls';
import { addAccount, addBook, addCompany, COMPANY_COLORS, parseBookRange } from './data';
import { ColorPicker } from './ColorPicker';

/** أول فتح للتطبيق: شركة وحساب ودفتر في شاشة واحدة، وبعدها المحاسب يكتب شيك فوراً. */
export function SetupPage() {
  const templates = useLiveQuery(() => db.templates.toArray(), []);
  const [accountant, setAccountant] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [color, setColor] = useState(COMPANY_COLORS[0].value);
  const [bankName, setBankName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const banks = [...new Set(templates?.map((t) => t.bankName))];
  const bank = bankName || banks[0] || '';
  const models = templates?.filter((t) => t.bankName === bank) ?? [];
  const model = models.find((t) => t.id === templateId) ?? models[0];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const range = parseBookRange(from, to, toLatinDigits);
    const next: Record<string, string> = {};
    if (!accountant.trim()) next.accountant = 'اكتب اسمك، هيظهر في السجل ونسخة المراجعة';
    if (!companyName.trim()) next.company = 'اكتب اسم الشركة';
    if (!range.ok) next.range = range.error;
    setErrors(next);
    if (Object.keys(next).length > 0 || !range.ok || !model) return;

    await setSetting('accountantName', accountant.trim());
    const company = await addCompany(companyName, color);
    const account = await addAccount({ companyId: company.id, bankName: bank, label: model.modelName, accountNumber: '', templateId: model.id });
    await addBook({ companyId: company.id, accountId: account.id, fromNumber: range.from, toNumber: range.to, numberWidth: range.width });
  };

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-3xl font-bold">شيكاتي</h1>
      <p className="mt-2 text-ink-soft">نجهّز أول دفتر شيكات. كل البيانات بتتحفظ على جهازك بس.</p>

      <form onSubmit={(e) => void submit(e)} className="mt-8 flex flex-col gap-5" noValidate>
        <TextInput label="اسمك" value={accountant} onChange={setAccountant} error={errors.accountant} autoComplete="name" />
        <TextInput label="اسم الشركة" value={companyName} onChange={setCompanyName} error={errors.company} />
        <ColorPicker value={color} onChange={setColor} />

        <hr className="border-rule" />

        <Select label="البنك" value={bank} onChange={(v) => { setBankName(v); setTemplateId(''); }}>
          {banks.map((b) => <option key={b}>{b}</option>)}
        </Select>
        <Select
          label="نموذج الشيك" value={model?.id ?? ''} onChange={setTemplateId}
          hint="اسم البنك لوحده مش كفاية، طابق شكل الورقة. تقدر تغيّره بعدين."
        >
          {models.map((t) => <option key={t.id} value={t.id}>{t.modelName}</option>)}
        </Select>

        <div className="grid grid-cols-2 gap-3">
          <DigitInput label="أول رقم في الدفتر" value={from} onChange={setFrom} error={errors.range} />
          <DigitInput label="آخر رقم في الدفتر" value={to} onChange={setTo} />
        </div>

        <Button type="submit" variant="primary" className="mt-2">ابدأ</Button>
      </form>
    </main>
  );
}
