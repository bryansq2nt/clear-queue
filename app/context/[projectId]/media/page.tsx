import { requireAuth } from '@/lib/auth';
import { getProjectModules } from '@/app/actions/modules';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextMediaFromCache from './ContextMediaFromCache';

export default async function ContextMediaPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const { projectId } = params;

  const modules = await getProjectModules(projectId);
  const mod = modules.find((m) => m.key === 'media');
  if (!mod?.enabled) {
    return <ModuleDisabledView moduleKey="media" projectId={projectId} />;
  }

  return <ContextMediaFromCache projectId={projectId} />;
}
