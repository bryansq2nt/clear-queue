import { requireAuth } from '@/lib/auth';
import { getProjectModules } from '@/app/actions/modules';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextDocumentsFromCache from './ContextDocumentsFromCache';

export default async function ContextDocumentsPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const { projectId } = params;

  const modules = await getProjectModules(projectId);
  const mod = modules.find((m) => m.key === 'documents');
  if (!mod?.enabled) {
    return <ModuleDisabledView moduleKey="documents" projectId={projectId} />;
  }

  return <ContextDocumentsFromCache projectId={projectId} />;
}
