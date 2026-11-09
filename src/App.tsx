import { Navigate, Route, Routes } from 'react-router';
import { useCurrentCompany } from '@/state/useAppData';
import { Shell } from '@/features/shell/Shell';
import { SetupPage } from '@/features/companies/SetupPage';
import { CompaniesPage } from '@/features/companies/CompaniesPage';
import { ComposePage } from '@/features/compose/ComposePage';
import { ReviewPage } from '@/features/compose/ReviewPage';
import { DraftsPage } from '@/features/compose/DraftsPage';

export function App() {
  const { companies } = useCurrentCompany();
  if (companies === undefined) return null;
  if (companies.length === 0) return <SetupPage />;

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Navigate to="/cheque" replace />} />
        <Route path="cheque/:id?" element={<ComposePage />} />
        <Route path="cheque/:id/review" element={<ReviewPage />} />
        <Route path="drafts" element={<DraftsPage />} />
        <Route path="companies" element={<CompaniesPage />} />
        <Route path="*" element={<Navigate to="/cheque" replace />} />
      </Route>
    </Routes>
  );
}
