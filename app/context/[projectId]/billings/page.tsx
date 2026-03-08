import { requireAuth } from '@/lib/auth';
import { getProjectModules } from '@/app/actions/modules';
import { getProjectById } from '@/app/actions/projects';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextBillingsFromCache from './ContextBillingsFromCache';

export default async function ContextBillingsPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const { projectId } = params;

  const [modules, project] = await Promise.all([
    getProjectModules(projectId),
    getProjectById(projectId),
  ]);

  const mod = modules.find((m) => m.key === 'billings');
  if (!mod?.enabled) {
    return <ModuleDisabledView moduleKey="billings" projectId={projectId} />;
  }

  return (
    <ContextBillingsFromCache
      projectId={projectId}
      projectClientId={project?.client_id ?? null}
    />
  );
}
