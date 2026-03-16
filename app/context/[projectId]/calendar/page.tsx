import { requireAuth } from '@/lib/auth';
import { getCanViewModule } from '@/app/actions/modules';
import { getCalendarPermissions } from '@/app/actions/calendar';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextCalendarFromCache from './ContextCalendarFromCache';

export default async function ContextCalendarPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const { projectId } = params;

  const [{ canView, reason }, permissions] = await Promise.all([
    getCanViewModule(projectId, 'calendar'),
    getCalendarPermissions(projectId),
  ]);

  if (!canView && reason) {
    return (
      <ModuleDisabledView
        moduleKey="calendar"
        projectId={projectId}
        reason={reason}
      />
    );
  }

  return (
    <ContextCalendarFromCache projectId={projectId} permissions={permissions} />
  );
}
