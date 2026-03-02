import { requireAuth } from '@/lib/auth';
import { getProjectModules } from '@/app/actions/modules';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextOwnerFromCache from './ContextOwnerFromCache';

export default async function ContextOwnerPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const { projectId } = params;

  const modules = await getProjectModules(projectId);
  const mod = modules.find((m) => m.key === 'owner');
  if (!mod?.enabled) {
    return <ModuleDisabledView moduleKey="owner" projectId={projectId} />;
  }

  return <ContextOwnerFromCache projectId={projectId} />;
}
