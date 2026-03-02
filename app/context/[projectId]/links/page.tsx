import { requireAuth } from '@/lib/auth';
import { getProjectModules } from '@/app/actions/modules';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextLinksFromCache from './ContextLinksFromCache';

export default async function ContextLinksPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const { projectId } = params;

  const modules = await getProjectModules(projectId);
  const mod = modules.find((m) => m.key === 'links');
  if (!mod?.enabled) {
    return <ModuleDisabledView moduleKey="links" projectId={projectId} />;
  }

  return <ContextLinksFromCache projectId={projectId} />;
}
