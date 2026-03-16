import { requireAuth } from '@/lib/auth';
import { getCanViewModule } from '@/app/actions/modules';
import { getOwnerPermissions } from '@/app/actions/clients';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextOwnerFromCache from './ContextOwnerFromCache';

export default async function ContextOwnerPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const { projectId } = params;

  const [{ canView, reason }, permissions] = await Promise.all([
    getCanViewModule(projectId, 'owner'),
    getOwnerPermissions(projectId),
  ]);

  if (!canView && reason) {
    return (
      <ModuleDisabledView
        moduleKey="owner"
        projectId={projectId}
        reason={reason}
      />
    );
  }

  return (
    <ContextOwnerFromCache projectId={projectId} permissions={permissions} />
  );
}
