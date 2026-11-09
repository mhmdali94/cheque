import { builtinTemplates } from '@/core/templates';
import type { PrinterProfile } from '@/core/types';
import { db, type ShikatyDB } from './schema';

export const TOSHIBA_PROFILE_ID = 'printer-toshiba-408p';

export const TOSHIBA_PROFILE: PrinterProfile = {
  id: TOSHIBA_PROFILE_ID,
  name: 'توشيبا ٤٠٨',
  pageMode: 'a4',
  rotation: 90,
  mirrored: false,
  align: 'center',
  leadingMarginMm: 5,
  builtin: true,
  updatedAt: 0,
};

const PERSONAL_TEMPLATE_ID = 'tpl-alex-personal';
/** لازم الشيك الشخصي يطابق الإسكندرية حتى لو نسخة قديمة منه اتحفظت كمضبوطة، مرة واحدة بس. */
const PERSONAL_RESET_KEY = 'reset:tpl-alex-personal:1';

/** يضيف الجاهز الناقص ويحدّث اللي المحاسب ما عدّلوش، ولا يكتب فوق أي قالب مضبوط. */
export async function ensureSeeded(database: ShikatyDB = db): Promise<void> {
  await database.transaction('rw', database.templates, database.printerProfiles, database.settings, async () => {
    const templates = builtinTemplates();
    const personalReset = Boolean(await database.settings.get(PERSONAL_RESET_KEY));
    const existing = await database.templates.bulkGet(templates.map((t) => t.id));
    await database.templates.bulkPut(
      templates.flatMap((template, index) => {
        const stored = existing[index];
        if (!stored) return [template];
        const forceRefresh = template.id === PERSONAL_TEMPLATE_ID && !personalReset;
        return stored.accuracy === 'adjusted' && !forceRefresh ? [] : [{ ...template, imageId: stored.imageId }];
      }),
    );
    if (!personalReset) await database.settings.put({ key: PERSONAL_RESET_KEY, value: true });
    if (!(await database.printerProfiles.get(TOSHIBA_PROFILE_ID))) {
      await database.printerProfiles.add(TOSHIBA_PROFILE);
    }
  });
}
