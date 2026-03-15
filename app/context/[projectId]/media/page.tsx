import { requireAuth } from '@/lib/auth';
import { getCanViewModule } from '@/app/actions/modules';
import { getMediaPermissions } from '@/app/actions/media';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextMediaFromCache from './ContextMediaFromCache';

export const dynamic = 'force-dynamic';

export default async function ContextMediaPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const { projectId } = params;

  const { canView, reason } = await getCanViewModule(projectId, 'media');
  if (!canView && reason) {
    return (
      <ModuleDisabledView
        moduleKey="media"
        projectId={projectId}
        reason={reason}
      />
    );
  }

  const permissions = await getMediaPermissions(projectId);

  return (
    <ContextMediaFromCache projectId={projectId} permissions={permissions} />
  );
}
