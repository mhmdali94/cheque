import { DATA_VERSION, db } from '@/db/schema';
import { newId } from '@/db/repos';
import { templateFileSchema, TEMPLATE_FILE_KIND } from '@/core/schemas';
import { builtinTemplates } from '@/core/templates';
import type { ChequeTemplate } from '@/core/types';
import { base64ToBlob, blobToBase64, downloadBlob } from '@/ui/download';

export async function duplicateTemplate(template: ChequeTemplate, modelName?: string): Promise<ChequeTemplate> {
  const now = Date.now();
  const model = modelName?.trim() || `${template.modelName} (نسخة)`;
  const copy: ChequeTemplate = {
    ...structuredClone(template), id: newId(), name: `${template.bankName}: ${model}`, modelName: model,
    builtin: false, createdAt: now, updatedAt: now,
  };
  await db.templates.add(copy);
  return copy;
}

/** بنك أو نموذج جديد يبدأ بأماكن قالب موجود، والمحاسب يقيسه ويضبطه. */
export async function createTemplateFor(base: ChequeTemplate, bankName: string, modelName: string): Promise<ChequeTemplate> {
  const now = Date.now();
  const template: ChequeTemplate = {
    ...structuredClone(base), id: newId(), bankName, modelName, name: `${bankName}: ${modelName}`,
    accuracy: 'unmeasured', imageId: undefined, builtin: false, createdAt: now, updatedAt: now,
  };
  await db.templates.add(template);
  return template;
}

/** يرجع القالب الجاهز لأماكنه الأصلية، ويسيب صورة المحاسب. */
export async function resetBuiltin(template: ChequeTemplate): Promise<void> {
  const original = builtinTemplates().find((t) => t.id === template.id);
  if (original) await db.templates.put({ ...original, imageId: template.imageId, updatedAt: Date.now() });
}

export async function exportTemplate(template: ChequeTemplate): Promise<void> {
  const stored = template.imageId ? await db.images.get(template.imageId) : undefined;
  const file = {
    kind: TEMPLATE_FILE_KIND,
    dataVersion: DATA_VERSION,
    template,
    image: stored ? { mime: stored.mime, base64: await blobToBase64(stored.data) } : undefined,
  };
  downloadBlob(new Blob([JSON.stringify(file)], { type: 'application/json' }), `قالب ${template.name}.json`);
}

/** القالب المستورد ياخد معرّف جديد، فمفيش قالب موجود بيتكتب فوقه. */
export async function importTemplateFile(raw: string): Promise<ChequeTemplate> {
  const parsed = templateFileSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error('الملف ده مش قالب شيكاتي صالح');

  const now = Date.now();
  const imageId = parsed.data.image ? newId() : undefined;
  const template: ChequeTemplate = { ...parsed.data.template, id: newId(), imageId, builtin: false, createdAt: now, updatedAt: now };
  await db.transaction('rw', db.templates, db.images, async () => {
    if (parsed.data.image && imageId) {
      await db.images.add({
        id: imageId, mime: parsed.data.image.mime, data: base64ToBlob(parsed.data.image.base64, parsed.data.image.mime), updatedAt: now,
      });
    }
    await db.templates.add(template);
  });
  return template;
}

export interface TemplateUsage {
  accounts: number;
  drafts: number;
}

export async function templateUsage(templateId: string): Promise<TemplateUsage> {
  const [accounts, cheques] = await Promise.all([
    db.accounts.toArray().then((rows) => rows.filter((a) => a.templateId === templateId).length),
    db.cheques.where('status').equals('draft').toArray().then((rows) => rows.filter((c) => c.templateId === templateId).length),
  ]);
  return { accounts, drafts: cheques };
}

/**
 * يمسح قالب عمله المحاسب. القوالب الجاهزة مش بتتمسح لأن التطبيق بيرجّعها.
 * الحسابات والمسودات اللي عليه بترجع لقالب البنك الجاهز، والشيكات المطبوعة محتفظة بأماكنها.
 */
export async function deleteTemplate(template: ChequeTemplate): Promise<void> {
  if (template.builtin) throw new Error('القوالب الجاهزة مش بتتمسح. استخدم «ارجع للأماكن الأصلية».');
  const replacement = builtinTemplates().find((t) => t.bankName === template.bankName && t.accuracy !== 'unmeasured')
    ?? builtinTemplates().find((t) => t.bankName === template.bankName);
  const usage = await templateUsage(template.id);
  if (!replacement && (usage.accounts > 0 || usage.drafts > 0)) {
    throw new Error('القالب ده مستخدم في حساب أو مسودة، ومفيش قالب جاهز للبنك ده يرجعوا له. غيّر قالبهم الأول.');
  }

  await db.transaction('rw', db.templates, db.accounts, db.cheques, db.images, async () => {
    if (replacement) {
      const now = Date.now();
      await db.accounts.filter((a) => a.templateId === template.id).modify({ templateId: replacement.id, updatedAt: now });
      await db.cheques.filter((c) => c.status === 'draft' && c.templateId === template.id).modify({ templateId: replacement.id, updatedAt: now });
    }
    await db.templates.delete(template.id);
    if (template.imageId) {
      const stillUsed = await db.templates.filter((t) => t.imageId === template.imageId).count();
      if (stillUsed === 0) await db.images.delete(template.imageId);
    }
  });
}
