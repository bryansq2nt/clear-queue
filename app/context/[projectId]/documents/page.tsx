import { requireAuth } from '@/lib/auth';
import { getCanViewModule } from '@/app/actions/modules';
import { getDocuments, getDocumentsPermissions } from '@/app/actions/documents';
import { listFolders } from '@/app/actions/document-folders';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextDocumentsClient from './ContextDocumentsClient';

export default async function ContextDocumentsPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const { projectId } = params;

  const [{ canView, reason }, permissions, documents, folders] =
    await Promise.all([
      getCanViewModule(projectId, 'documents'),
      getDocumentsPermissions(projectId),
      getDocuments(projectId),
      listFolders(projectId),
    ]);

  if (!canView && reason) {
    return (
      <ModuleDisabledView
        moduleKey="documents"
        projectId={projectId}
        reason={reason}
      />
    );
  }

  return (
    <ContextDocumentsClient
      projectId={projectId}
      initialDocuments={documents}
      initialFolders={folders}
      permissions={permissions}
    />
  );
}
