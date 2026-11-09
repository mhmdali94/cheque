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

/** يضيف الجاهز الناقص ويحدّث اللي المحاسب ما عدّلوش، ولا يكتب فوق أي قالب مضبوط. */
export async function ensureSeeded(database: ShikatyDB = db): Promise<void> {
  await database.transaction('rw', database.templates, database.printerProfiles, async () => {
    const templates = builtinTemplates();
    const existing = await database.templates.bulkGet(templates.map((t) => t.id));
    await database.templates.bulkPut(
      templates.flatMap((template, index) => {
        const stored = existing[index];
        if (!stored) return [template];
        return stored.accuracy === 'adjusted' ? [] : [{ ...template, imageId: stored.imageId }];
      }),
    );
    if (!(await database.printerProfiles.get(TOSHIBA_PROFILE_ID))) {
      await database.printerProfiles.add(TOSHIBA_PROFILE);
    }
  });
}
