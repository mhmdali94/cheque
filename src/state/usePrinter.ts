import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Calibration, PrinterProfile } from '@/core/types';
import { getDeviceId, setSetting } from '@/db/repos';
import { db } from '@/db/schema';
import { TOSHIBA_PROFILE_ID } from '@/db/seed';
import type { PdfRenderer } from '@/print/chequePdf';

const DEFAULTS = { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 };

export const trialKey = (printerId: string, templateId: string) => `trial:${printerId}:${templateId}`;

export interface PrinterState {
  profiles: PrinterProfile[] | undefined;
  profile: PrinterProfile | undefined;
  calibration: Pick<Calibration, 'offsetX' | 'offsetY' | 'scaleX' | 'scaleY'>;
  renderer: PdfRenderer;
  selectPrinter: (id: string) => Promise<void>;
  updateProfile: (patch: Partial<PrinterProfile>) => Promise<void>;
  updateCalibration: (patch: Partial<typeof DEFAULTS>) => Promise<void>;
}

export function usePrinter(): PrinterState {
  const profiles = useLiveQuery(() => db.printerProfiles.toArray(), []);
  const currentId = useLiveQuery(() => db.settings.get('currentPrinterId').then((e) => (e?.value as string) ?? TOSHIBA_PROFILE_ID), []);
  const renderer = useLiveQuery(() => db.settings.get('pdfRenderer').then((e) => (e?.value as PdfRenderer) ?? 'vector'), []) ?? 'vector';
  const profile = profiles?.find((p) => p.id === currentId) ?? profiles?.[0];

  // معرّف الجهاز ممكن يتكتب أول مرة، فلازم يتجاب خارج الاستعلام الحي (قراءة فقط).
  const [deviceId, setDeviceId] = useState<string>();
  useEffect(() => { void getDeviceId().then(setDeviceId); }, []);

  const stored = useLiveQuery(
    () => (profile && deviceId ? db.calibrations.get(`${profile.id}:${deviceId}`) : undefined),
    [profile?.id, deviceId],
  );

  const selectPrinter = useCallback((id: string) => setSetting('currentPrinterId', id), []);

  const updateProfile = useCallback(async (patch: Partial<PrinterProfile>) => {
    if (profile) await db.printerProfiles.update(profile.id, { ...patch, updatedAt: Date.now() });
  }, [profile]);

  const updateCalibration = useCallback(async (patch: Partial<typeof DEFAULTS>) => {
    if (!profile) return;
    const deviceId = await getDeviceId();
    const id = `${profile.id}:${deviceId}`;
    const current = (await db.calibrations.get(id)) ?? {
      id, printerId: profile.id, deviceId, deviceName: navigator.platform, ...DEFAULTS, updatedAt: 0,
    };
    await db.calibrations.put({ ...current, ...patch, updatedAt: Date.now() });
  }, [profile]);

  return { profiles, profile, calibration: stored ?? DEFAULTS, renderer, selectPrinter, updateProfile, updateCalibration };
}
