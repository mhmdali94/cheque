import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { toArabicDigits, toLatinDigits } from '@/core/digits';
import { layoutCheque, type ChequeValues } from '@/core/layout';
import { ACCURACY_LABEL } from '@/core/templates';
import type { Box, ChequeTemplate, TextField } from '@/core/types';
import { db } from '@/db/schema';
import { useStoredImageUrl } from '@/features/preview/ChequePreview';
import { commandsToSvgPath, transformCommands } from '@/print/shaper';
import { compose, rotationAround, translation } from '@/core/geometry';
import { useShaper } from '@/state/useAppData';
import { Button, DigitInput, Notice, PageHeader, Select } from '@/ui/controls';
import { orderedTemplates } from '@/features/companies/data';
import { exportTemplate, resetBuiltin } from './data';
import { PhotoCapture } from './PhotoCapture';

const SNAP_MM = 0.5;
const MIN_SIZE_MM = 2;
const RULER_MM = 7;
const SAVE_DELAY_MS = 300;

const SAMPLE: ChequeValues = {
  payee: 'اسم المستفيد هنا', amount: 148500, date: '2026-03-14', memo: 'بيان', signatoryName: 'اسم المفوض',
  crossing: { kind: 'firstBeneficiary', text: '', drawLines: false }, printStub: true,
  tafqeetPresetId: 'accounting', amountProtection: 'slash',
};

type FieldId = 'date' | 'payee' | 'line1' | 'line2' | 'digits' | 'crossing' | 'name' | 'memo' | 'signature' | 'stubDate' | 'stubPayee' | 'stubAmount';

interface FieldDefinition {
  id: FieldId;
  label: string;
  get: (t: ChequeTemplate) => Box;
  set: (t: ChequeTemplate, box: Box) => ChequeTemplate;
  stubOnly?: boolean;
}

const FIELDS: FieldDefinition[] = [
  { id: 'date', label: 'التاريخ', get: (t) => t.date, set: (t, b) => {
    // الخانات تتحرك مع مربعها، ومسافاتها تتقسم على عرضه الجديد.
    const pitch = b.w / 8;
    return { ...t, date: { ...t.date, ...b, cellPitch: pitch, firstCellCenterX: b.x + pitch / 2 } };
  } },
  { id: 'payee', label: 'المستفيد', get: (t) => t.payee, set: (t, b) => ({ ...t, payee: { ...t.payee, ...b } }) },
  { id: 'line1', label: 'بالحروف، سطر ١', get: (t) => t.amountWords.line1, set: (t, b) => ({ ...t, amountWords: { ...t.amountWords, line1: { ...t.amountWords.line1, ...b } } }) },
  { id: 'line2', label: 'بالحروف، سطر ٢', get: (t) => t.amountWords.line2, set: (t, b) => ({ ...t, amountWords: { ...t.amountWords, line2: { ...t.amountWords.line2, ...b } } }) },
  { id: 'digits', label: 'بالأرقام', get: (t) => t.amountDigits, set: (t, b) => ({ ...t, amountDigits: { ...t.amountDigits, ...b } }) },
  { id: 'crossing', label: 'التسطير', get: (t) => t.crossing, set: (t, b) => ({ ...t, crossing: { ...t.crossing, ...b } }) },
  { id: 'name', label: 'اسم المفوض بالتوقيع', get: (t) => t.signatoryName, set: (t, b) => ({ ...t, signatoryName: { ...t.signatoryName, ...b } }) },
  { id: 'memo', label: 'البيان', get: (t) => t.memo, set: (t, b) => ({ ...t, memo: { ...t.memo, ...b } }) },
  { id: 'signature', label: 'مكان التوقيع', get: (t) => t.signatureBox, set: (t, b) => ({ ...t, signatureBox: b }) },
  { id: 'stubDate', label: 'الكعب، التاريخ', stubOnly: true, get: (t) => t.stub.date, set: (t, b) => ({ ...t, stub: { ...t.stub, date: { ...t.stub.date, ...b } } }) },
  { id: 'stubPayee', label: 'الكعب، المستفيد', stubOnly: true, get: (t) => t.stub.payee, set: (t, b) => ({ ...t, stub: { ...t.stub, payee: { ...t.stub.payee, ...b } } }) },
  { id: 'stubAmount', label: 'الكعب، المبلغ', stubOnly: true, get: (t) => t.stub.amount, set: (t, b) => ({ ...t, stub: { ...t.stub, amount: { ...t.stub.amount, ...b } } }) },
];

const textFieldOf = (t: ChequeTemplate, id: FieldId): TextField | null => {
  if (id === 'signature') return null;
  return FIELDS.find((f) => f.id === id)!.get(t) as TextField;
};

const snap = (value: number) => Math.round(value / SNAP_MM) * SNAP_MM;
const fmt = (value: number) => toArabicDigits(Number(value.toFixed(2))).replace('.', '٫');

const parseDecimal = (input: string) => Number(toLatinDigits(input).replace('٫', '.'));

function NumberControl({ label, value, onCommit, hint }: { label: string; value: number; onCommit: (v: number) => void; hint?: string }) {
  const display = String(Number(value.toFixed(2))).replace('.', '٫');
  const [text, setText] = useState(display);
  useEffect(() => setText((current) => (parseDecimal(current) === Number(value.toFixed(2)) ? current : display)), [value, display]);
  return (
    <DigitInput
      label={label} value={text} hint={hint}
      onChange={(input) => {
        setText(input.replace('.', '٫'));
        const parsed = parseDecimal(input);
        if (input.trim() !== '' && Number.isFinite(parsed)) onCommit(parsed);
      }}
    />
  );
}

interface DragState {
  mode: 'move' | 'resize-start' | 'resize-end';
  field: FieldDefinition;
  origin: Box;
  startX: number;
  startY: number;
}

export function TemplateEditorPage() {
  const { id = '' } = useParams();
  // مفتاح القالب بيعيد بناء الشاشة، فأي تعديل معلق يتحفظ قبل الانتقال لقالب تاني.
  return <TemplateEditor key={id} id={id} />;
}

function TemplateEditor({ id }: { id: string }) {
  const navigate = useNavigate();
  const stored = useLiveQuery(() => db.templates.get(id), [id]);
  const allTemplates = useLiveQuery(() => orderedTemplates(), []);
  const [dirty, setDirty] = useState(false);
  const [template, setTemplate] = useState<ChequeTemplate | null>(null);
  const [selected, setSelected] = useState<FieldId>('payee');
  const [showGrid, setShowGrid] = useState(true);
  const { shaper } = useShaper();
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const pendingRef = useRef<ChequeTemplate | null>(null);
  const imageUrl = useStoredImageUrl(template?.imageId);

  useEffect(() => {
    if (stored && pendingRef.current === null) setTemplate(stored);
  }, [stored]);

  const flush = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    const pending = pendingRef.current;
    if (pending) {
      pendingRef.current = null;
      void db.templates.put(pending);
    }
    setDirty(false);
  }, []);
  useEffect(() => flush, [flush]);

  const change = useCallback((updater: (t: ChequeTemplate) => ChequeTemplate) => {
    setDirty(true);
    setTemplate((current) => {
      if (!current) return current;
      const next = { ...updater(current), accuracy: 'adjusted' as const, updatedAt: Date.now() };
      pendingRef.current = next;
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(flush, SAVE_DELAY_MS);
      return next;
    });
  }, [flush]);

  const model = useMemo(() => (template && shaper ? layoutCheque(template, SAMPLE, shaper) : null), [template, shaper]);

  if (!template) return null;

  const banks = [...new Set(allTemplates?.map((t) => t.bankName))];
  const sameBank = allTemplates?.filter((t) => t.bankName === template.bankName) ?? [];
  const openBank = (bank: string) => {
    const list = allTemplates?.filter((t) => t.bankName === bank) ?? [];
    // القالب الأصلي المقاس أولاً، مش النسخ.
    const target = list.find((t) => t.builtin && t.accuracy !== 'unmeasured') ?? list.find((t) => t.builtin) ?? list[0];
    if (target) navigate(`/templates/${target.id}`);
  };

  const L = template.lengthMm;
  const W = template.widthMm;
  const stubW = template.stub.enabled ? template.stub.widthMm : 0;
  const visibleFields = FIELDS.filter((f) => !f.stubOnly || template.stub.enabled);
  const definition = visibleFields.find((f) => f.id === selected) ?? visibleFields[0];
  const box = definition.get(template);
  const textField = textFieldOf(template, definition.id);

  const toMm = (event: PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const scale = (L + stubW + RULER_MM) / rect.width;
    return { x: (event.clientX - rect.left) * scale - RULER_MM, y: (event.clientY - rect.top) * scale - RULER_MM };
  };

  const startDrag = (event: PointerEvent, field: FieldDefinition, mode: DragState['mode']) => {
    event.stopPropagation();
    (event.target as Element).setPointerCapture(event.pointerId);
    setSelected(field.id);
    const point = toMm(event);
    dragRef.current = { mode, field, origin: { ...field.get(template) }, startX: point.x, startY: point.y };
  };

  const onDrag = (event: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const point = toMm(event);
    const [dx, dy] = [point.x - drag.startX, point.y - drag.startY];
    const { origin: o } = drag;
    let next: Box;
    if (drag.mode === 'move') {
      next = { ...o, x: snap(o.x + dx), y: snap(o.y + dy) };
    } else if (drag.mode === 'resize-end') {
      next = { ...o, w: Math.max(MIN_SIZE_MM, snap(o.w + dx)), h: Math.max(MIN_SIZE_MM, snap(o.h + dy)) };
    } else {
      const x = Math.min(snap(o.x + dx), o.x + o.w - MIN_SIZE_MM);
      next = { ...o, x, w: o.x + o.w - x, h: Math.max(MIN_SIZE_MM, snap(o.h + dy)) };
    }
    change((t) => drag.field.set(t, next));
  };

  const onKey = (event: KeyboardEvent, field: FieldDefinition) => {
    const moves: Record<string, [number, number]> = { ArrowLeft: [-SNAP_MM, 0], ArrowRight: [SNAP_MM, 0], ArrowUp: [0, -SNAP_MM], ArrowDown: [0, SNAP_MM] };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const current = field.get(template);
    change((t) => field.set(t, { ...current, x: current.x + move[0], y: current.y + move[1] }));
  };

  const patchText = (patch: Partial<TextField>) => {
    if (!textField) return;
    change((t) => definition.set(t, { ...textField, ...patch } as Box));
  };

  const inForbidden = box.y + box.h > template.micrLineY;

  return (
    <>
      <PageHeader title={template.name}>
        <Button variant="primary" disabled={!dirty} onClick={flush}>{dirty ? 'حفظ التعديلات' : 'محفوظ'}</Button>
        <Link className="flex min-h-11 items-center font-semibold text-accent underline" to={`/templates/${template.id}/measure`}>قياس الشيك</Link>
        <Button onClick={() => void exportTemplate(template)}>تصدير القالب</Button>
        {template.builtin && (
          <Button variant="ghost" onClick={() => { pendingRef.current = null; window.clearTimeout(saveTimer.current); setDirty(false); void resetBuiltin(template); }}>ارجع للأماكن الأصلية</Button>
        )}
      </PageHeader>

      <div className="mb-4 grid max-w-2xl gap-3 sm:grid-cols-2">
        <Select label="البنك" value={template.bankName} onChange={openBank}>
          {banks.map((bank) => <option key={bank}>{bank}</option>)}
        </Select>
        <Select label="النموذج" value={template.id} onChange={(next) => navigate(`/templates/${next}`)}>
          {sameBank.map((t) => <option key={t.id} value={t.id}>{t.modelName}</option>)}
        </Select>
      </div>

      {!template.builtin && (
        <div className="mb-4"><Notice tone="warn">ده قالب منسوخ، فمش بيستقبل تحديثات الأماكن. الحساب لازم يكون مربوط بالقالب الأصلي عشان يطبع صح.</Notice></div>
      )}

      {template.accuracy !== 'adjusted' && <div className="mb-4"><Notice tone="warn">{ACCURACY_LABEL[template.accuracy]}</Notice></div>}

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <svg
            ref={svgRef} viewBox={`${-RULER_MM} ${-RULER_MM} ${L + stubW + RULER_MM} ${W + RULER_MM}`} className="block w-full touch-none select-none"
            role="group" aria-label="لوحة ضبط أماكن الحقول" fontFamily="Cairo, sans-serif"
            onPointerMove={onDrag} onPointerUp={() => { dragRef.current = null; flush(); }}
          >
            <rect x={0} y={0} width={L + stubW} height={W} fill="oklch(0.95 0.012 88)" stroke="oklch(0.6 0.02 88)" strokeWidth={0.2} />
            {imageUrl && <image href={imageUrl} x={0} y={0} width={L} height={W} preserveAspectRatio="none" />}

            {showGrid && Array.from({ length: Math.floor((L + stubW) / 5) + 1 }, (_, i) => (
              <line key={`v${i}`} x1={i * 5} x2={i * 5} y1={0} y2={W} stroke="oklch(0.5 0.02 200 / 0.14)" strokeWidth={0.08} />
            ))}
            {showGrid && Array.from({ length: Math.floor(W / 5) + 1 }, (_, i) => (
              <line key={`h${i}`} x1={0} x2={L + stubW} y1={i * 5} y2={i * 5} stroke="oklch(0.5 0.02 200 / 0.14)" strokeWidth={0.08} />
            ))}

            {Array.from({ length: Math.floor((L + stubW) / 10) + 1 }, (_, i) => (
              <g key={`rx${i}`}>
                <line x1={i * 10} x2={i * 10} y1={-2} y2={0} stroke="currentColor" strokeWidth={0.15} />
                <text x={i * 10} y={-3} textAnchor="middle" fontSize={2.4} fill="currentColor">{toArabicDigits(i * 10)}</text>
              </g>
            ))}
            {Array.from({ length: Math.floor(W / 10) + 1 }, (_, i) => (
              <g key={`ry${i}`}>
                <line x1={-2} x2={0} y1={i * 10} y2={i * 10} stroke="currentColor" strokeWidth={0.15} />
                <text x={-3} y={i * 10 + 0.9} textAnchor="end" fontSize={2.4} fill="currentColor">{toArabicDigits(i * 10)}</text>
              </g>
            ))}

            <rect x={0} y={template.micrLineY} width={L} height={W - template.micrLineY} fill="oklch(0.55 0.17 27 / 0.14)" />
            <line x1={0} x2={L} y1={template.micrLineY} y2={template.micrLineY} stroke="oklch(0.5 0.17 27)" strokeWidth={0.25} />
            <text x={L / 2} y={template.micrLineY + 5} textAnchor="middle" fontSize={2.8} fill="oklch(0.45 0.17 27)">منطقة ممنوعة</text>

            {model?.rules.map((r, i) => <line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} stroke="oklch(0.33 0.12 262)" strokeWidth={r.thicknessMm} />)}
            {shaper && model?.texts.map((item, index) => {
              let matrix = translation(item.x, item.y);
              if (item.angleDeg) matrix = compose(matrix, rotationAround(item.angleDeg, item.pivot.x, item.pivot.y));
              return <path key={index} d={commandsToSvgPath(transformCommands(shaper.outline(item).commands, matrix))} fill="oklch(0.33 0.12 262)" />;
            })}

            {visibleFields.map((field) => {
              const b = field.get(template);
              const active = field.id === definition.id;
              const handle = 2.4;
              return (
                <g key={field.id}>
                  <rect
                    x={b.x} y={b.y} width={b.w} height={b.h} tabIndex={0} role="button" aria-label={`${field.label}، حرّكه بالأسهم`} aria-pressed={active}
                    fill={active ? 'oklch(0.6 0.12 165 / 0.2)' : 'oklch(0.6 0.08 165 / 0.07)'}
                    stroke={active ? 'oklch(0.4 0.09 165)' : 'oklch(0.55 0.06 165 / 0.7)'} strokeWidth={active ? 0.35 : 0.18}
                    className="cursor-move"
                    onPointerDown={(e) => startDrag(e, field, 'move')} onFocus={() => setSelected(field.id)} onKeyDown={(e) => onKey(e, field)}
                  />
                  {active && (
                    <>
                      <rect x={b.x - handle / 2} y={b.y + b.h - handle / 2} width={handle} height={handle} fill="oklch(0.4 0.09 165)" className="cursor-nesw-resize" onPointerDown={(e) => startDrag(e, field, 'resize-start')} />
                      <rect x={b.x + b.w - handle / 2} y={b.y + b.h - handle / 2} width={handle} height={handle} fill="oklch(0.4 0.09 165)" className="cursor-nwse-resize" onPointerDown={(e) => startDrag(e, field, 'resize-end')} />
                    </>
                  )}
                </g>
              );
            })}
          </svg>

          <p aria-live="polite" className="mt-2 text-sm text-ink-soft">
            {definition.label}: من الشمال {fmt(box.x)} مم ، من فوق {fmt(box.y)} مم ، العرض {fmt(box.w)} مم ، الارتفاع {fmt(box.h)} مم
          </p>
          {inForbidden && <div className="mt-2"><Notice tone="danger">الحقل ده داخل منطقة الترميز الممنوعة</Notice></div>}

          <label className="mt-2 flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
            إظهار الشبكة (الالتصاق كل نص مليمتر)
          </label>

          <div className="mt-6"><h2 className="mb-2 font-bold">صورة الشيك</h2>
            <PhotoCapture lengthMm={L} widthMm={W} onSaved={(imageId) => change((t) => ({ ...t, imageId }))} />
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <Select label="الحقل" value={definition.id} onChange={(v) => setSelected(v as FieldId)}>
            {visibleFields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </Select>

          <div className="grid grid-cols-2 gap-3">
            <NumberControl label="من الشمال" value={box.x} onCommit={(x) => change((t) => definition.set(t, { ...box, x }))} />
            <NumberControl label="من فوق" value={box.y} onCommit={(y) => change((t) => definition.set(t, { ...box, y }))} />
            <NumberControl label="العرض" value={box.w} onCommit={(w) => w > 0 && change((t) => definition.set(t, { ...box, w }))} />
            <NumberControl label="الارتفاع" value={box.h} onCommit={(h) => h > 0 && change((t) => definition.set(t, { ...box, h }))} />
          </div>

          {textField && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <NumberControl label="حجم الخط" value={textField.fontSizePt} onCommit={(v) => v > 0 && patchText({ fontSizePt: v })} />
                <NumberControl label="أصغر خط" value={textField.minFontSizePt} onCommit={(v) => v > 0 && patchText({ minFontSizePt: v })} />
              </div>
              <Select label="المحاذاة" value={textField.align} onChange={(v) => patchText({ align: v as TextField['align'] })}>
                <option value="right">يمين</option><option value="center">وسط</option><option value="left">شمال</option>
              </Select>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={textField.bold} onChange={(e) => patchText({ bold: e.target.checked })} /> خط عريض
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={textField.enabled} onChange={(e) => patchText({ enabled: e.target.checked })} /> يتطبع على الشيك
              </label>
            </>
          )}

          {definition.id === 'date' && (
            <>
              <Select label="شكل التاريخ" value={template.date.mode} onChange={(v) => change((t) => ({ ...t, date: { ...t.date, mode: v as 'cells' | 'text' } }))}>
                <option value="cells">٨ خانات منفصلة</option><option value="text">سطر واحد</option>
              </Select>
              <Select label="ترتيب الخانات" value={template.date.cellOrder} onChange={(v) => change((t) => ({ ...t, date: { ...t.date, cellOrder: v as 'ymd' | 'ltr' | 'rtl' } }))}>
                <option value="ymd">سنة شهر يوم (اليوم على اليمين)</option>
                <option value="ltr">يوم شهر سنة (اليوم على الشمال)</option>
                <option value="rtl">معكوس رقم برقم</option>
              </Select>
              <NumberControl label="مركز أول خانة من الشمال" value={template.date.firstCellCenterX} onCommit={(v) => change((t) => ({ ...t, date: { ...t.date, firstCellCenterX: v } }))} />
              <NumberControl label="المسافة بين الخانات" value={template.date.cellPitch} onCommit={(v) => v > 0 && change((t) => ({ ...t, date: { ...t.date, cellPitch: v } }))} />
            </>
          )}

          {definition.id === 'digits' && (
            <Select label="مكان علامة الحماية" value={template.amountDigits.signSide} onChange={(v) => change((t) => ({ ...t, amountDigits: { ...t.amountDigits, signSide: v as 'right' | 'left' } }))}>
              <option value="right">يمين الرقم</option><option value="left">شمال الرقم</option>
            </Select>
          )}

          {definition.id === 'crossing' && (
            <NumberControl label="ميل العبارة بالدرجات" value={template.crossing.angleDeg} onCommit={(v) => change((t) => ({ ...t, crossing: { ...t.crossing, angleDeg: v } }))} hint="سالب يعني طالع ناحية اليمين." />
          )}

          <hr className="border-rule" />
          <NumberControl label="خط منطقة الترميز من فوق" value={template.micrLineY} onCommit={(v) => change((t) => ({ ...t, micrLineY: v }))} />
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={template.amountWords.fillRemainder} onChange={(e) => change((t) => ({ ...t, amountWords: { ...t.amountWords, fillRemainder: e.target.checked } }))} />
            ملء باقي سطر التفقيط بخط
          </label>
        </aside>
      </div>
    </>
  );
}
