import { requireAuth } from '@/lib/auth';
import { getDashboardData } from '@/app/actions/tasks';
import AnalyticsDashboard from '@/components/AnalyticsDashboard';

export default async function Dashboard() {
  await requireAuth();
  const { projects, tasks } = await getDashboardData();

  return <AnalyticsDashboard initialProjects={projects} initialTasks={tasks} />;
}
