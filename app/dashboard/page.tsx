import { requireAuth } from '@/lib/auth';
import AnalyticsDashboard from '@/components/AnalyticsDashboard';

export default async function Dashboard() {
  await requireAuth();

  return <AnalyticsDashboard />;
}
