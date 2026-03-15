import { requireAuth } from '@/lib/auth';
import { getCanViewModule } from '@/app/actions/modules';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextCalendarFromCache from './ContextCalendarFromCache';

export default async function ContextCalendarPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const { projectId } = params;

  const { canView, reason } = await getCanViewModule(projectId, 'calendar');
  if (!canView && reason) {
    return (
      <ModuleDisabledView
        moduleKey="calendar"
        projectId={projectId}
        reason={reason}
      />
    );
  }

  return <ContextCalendarFromCache projectId={projectId} />;
}
