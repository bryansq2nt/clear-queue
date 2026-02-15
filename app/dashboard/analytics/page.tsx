import { requireAuth } from '@/lib/auth';
import AnalyticsDashboard from '@/components/AnalyticsDashboard';

export default async function AnalyticsPage() {
  await requireAuth();

  return <AnalyticsDashboard />;
}
