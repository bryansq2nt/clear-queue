import { requireAuth } from '@/lib/auth';
import { getCanViewModule } from '@/app/actions/modules';
import { getProjectById } from '@/app/actions/projects';
import { getBillingsPermissions } from '@/app/actions/billings';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextBillingsFromCache from './ContextBillingsFromCache';

export default async function ContextBillingsPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const { projectId } = params;

  const [{ canView, reason }, project, permissions] = await Promise.all([
    getCanViewModule(projectId, 'billings'),
    getProjectById(projectId),
    getBillingsPermissions(projectId),
  ]);

  if (!canView && reason) {
    return (
      <ModuleDisabledView
        moduleKey="billings"
        projectId={projectId}
        reason={reason}
      />
    );
  }

  return (
    <ContextBillingsFromCache
      projectId={projectId}
      projectClientId={project?.client_id ?? null}
      permissions={permissions}
    />
  );
}
