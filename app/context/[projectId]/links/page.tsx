import { requireAuth } from '@/lib/auth';
import { getCanViewModule } from '@/app/actions/modules';
import { getLinksPermissions } from './actions';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextLinksFromCache from './ContextLinksFromCache';

export default async function ContextLinksPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const { projectId } = params;

  const [{ canView, reason }, permissions] = await Promise.all([
    getCanViewModule(projectId, 'links'),
    getLinksPermissions(projectId),
  ]);

  if (!canView && reason) {
    return (
      <ModuleDisabledView
        moduleKey="links"
        projectId={projectId}
        reason={reason}
      />
    );
  }

  return (
    <ContextLinksFromCache projectId={projectId} permissions={permissions} />
  );
}
