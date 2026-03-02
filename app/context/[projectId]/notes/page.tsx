import { requireAuth } from '@/lib/auth';
import { getProjectModules } from '@/app/actions/modules';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextNotesFromCache from './ContextNotesFromCache';

export default async function ContextNotesPage({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams: { folderId?: string };
}) {
  await requireAuth();
  const { projectId } = params;

  const modules = await getProjectModules(projectId);
  const mod = modules.find((m) => m.key === 'notes');
  if (!mod?.enabled) {
    return <ModuleDisabledView moduleKey="notes" projectId={projectId} />;
  }

  const folderId = searchParams.folderId ?? undefined;
  return (
    <ContextNotesFromCache projectId={projectId} initialFolderId={folderId} />
  );
}
