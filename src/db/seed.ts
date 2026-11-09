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

/** يضيف الجاهز الناقص فقط، فلا يكتب فوق تعديلات المحاسب. */
export async function ensureSeeded(database: ShikatyDB = db): Promise<void> {
  await database.transaction('rw', database.templates, database.printerProfiles, async () => {
    const templates = builtinTemplates();
    const existing = new Set(await database.templates.bulkGet(templates.map((t) => t.id)).then((rows) => rows.filter(Boolean).map((t) => t!.id)));
    await database.templates.bulkAdd(templates.filter((t) => !existing.has(t.id)));
    if (!(await database.printerProfiles.get(TOSHIBA_PROFILE_ID))) {
      await database.printerProfiles.add(TOSHIBA_PROFILE);
    }
  });
}
