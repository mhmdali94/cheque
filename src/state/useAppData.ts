import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Company } from '@/core/types';
import { setSetting } from '@/db/repos';
import { db } from '@/db/schema';
import { loadShaper, type Shaper } from '@/print/shaper';

export interface CurrentCompany {
  /** undefined لسه بيحمّل. */
  companies: Company[] | undefined;
  company: Company | undefined;
  selectCompany: (id: string) => Promise<void>;
}

export function useCurrentCompany(): CurrentCompany {
  const companies = useLiveQuery(() => db.companies.orderBy('name').toArray(), []);
  const currentId = useLiveQuery(() => db.settings.get('currentCompanyId').then((e) => (e?.value as string) ?? null), []);
  const company = companies?.find((c) => c.id === currentId) ?? companies?.[0];
  const selectCompany = useCallback((id: string) => setSetting('currentCompanyId', id), []);
  return { companies, company, selectCompany };
}

export function useShaper(): { shaper: Shaper | null; error: boolean } {
  const [shaper, setShaper] = useState<Shaper | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    loadShaper().then((s) => { if (alive) setShaper(s); }, () => { if (alive) setError(true); });
    return () => { alive = false; };
  }, []);
  return { shaper, error };
}
