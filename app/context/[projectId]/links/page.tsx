import { requireAuth } from '@/lib/auth';
import { getCanViewModule } from '@/app/actions/modules';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextLinksFromCache from './ContextLinksFromCache';

export default async function ContextLinksPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const { projectId } = params;

  const { canView, reason } = await getCanViewModule(projectId, 'links');
  if (!canView && reason) {
    return (
      <ModuleDisabledView
        moduleKey="links"
        projectId={projectId}
        reason={reason}
      />
    );
  }

  return <ContextLinksFromCache projectId={projectId} />;
}
