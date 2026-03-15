import { requireAuth } from '@/lib/auth';
import { getCanViewModule } from '@/app/actions/modules';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextCopilotFromCache from './ContextCopilotFromCache';

export default async function ContextCopilotPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const { projectId } = params;

  const { canView, reason } = await getCanViewModule(projectId, 'copilot');
  if (!canView && reason) {
    return (
      <ModuleDisabledView
        moduleKey="copilot"
        projectId={projectId}
        reason={reason}
      />
    );
  }

  return <ContextCopilotFromCache projectId={projectId} />;
}
