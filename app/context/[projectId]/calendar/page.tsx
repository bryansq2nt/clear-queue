import { requireAuth } from '@/lib/auth';
import { getProjectModules } from '@/app/actions/modules';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextCalendarFromCache from './ContextCalendarFromCache';

export default async function ContextCalendarPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const { projectId } = params;

  const modules = await getProjectModules(projectId);
  const mod = modules.find((m) => m.key === 'calendar');
  if (!mod?.enabled) {
    return <ModuleDisabledView moduleKey="calendar" projectId={projectId} />;
  }

  return <ContextCalendarFromCache projectId={projectId} />;
}
