import { requireAuth } from '@/lib/auth';
import { getProjectModules } from '@/app/actions/modules';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextCopilotFromCache from './ContextCopilotFromCache';

export default async function ContextCopilotPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const { projectId } = params;

  const modules = await getProjectModules(projectId);
  const mod = modules.find((m) => m.key === 'copilot');
  if (!mod?.enabled) {
    return <ModuleDisabledView moduleKey="copilot" projectId={projectId} />;
  }

  return <ContextCopilotFromCache projectId={projectId} />;
}
