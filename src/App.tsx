import { Navigate, Route, Routes } from 'react-router';
import { useCurrentCompany } from '@/state/useAppData';
import { Shell } from '@/features/shell/Shell';
import { SetupPage } from '@/features/companies/SetupPage';
import { CompaniesPage } from '@/features/companies/CompaniesPage';
import { ComposePage } from '@/features/compose/ComposePage';
import { ReviewPage } from '@/features/compose/ReviewPage';
import { DraftsPage } from '@/features/compose/DraftsPage';
import { TemplatesPage } from '@/features/templates/TemplatesPage';
import { TemplateEditorPage } from '@/features/templates/TemplateEditorPage';
import { MeasurePage } from '@/features/templates/MeasurePage';
import { ComparePage } from '@/features/templates/ComparePage';
import { PrinterPage } from '@/features/printer/PrinterPage';
import { HistoryPage } from '@/features/history/HistoryPage';
import { BackupPage } from '@/features/backup/BackupPage';
import { BatchPage } from '@/features/batch/BatchPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { SettingsPage } from '@/features/settings/SettingsPage';

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
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="templates/compare" element={<ComparePage />} />
        <Route path="templates/:id" element={<TemplateEditorPage />} />
        <Route path="templates/:id/measure" element={<MeasurePage />} />
        <Route path="printer" element={<PrinterPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="backup" element={<BackupPage />} />
        <Route path="batch" element={<BatchPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/cheque" replace />} />
      </Route>
    </Routes>
  );
}
