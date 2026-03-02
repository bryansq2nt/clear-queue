import { requireAuth } from '@/lib/auth';
import { getProjectModules } from '@/app/actions/modules';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextIdeasFromCache from './ContextIdeasFromCache';

export default async function ContextIdeasPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const { projectId } = params;

  const modules = await getProjectModules(projectId);
  const mod = modules.find((m) => m.key === 'ideas');
  if (!mod?.enabled) {
    return <ModuleDisabledView moduleKey="ideas" projectId={projectId} />;
  }

  return <ContextIdeasFromCache projectId={projectId} />;
}
