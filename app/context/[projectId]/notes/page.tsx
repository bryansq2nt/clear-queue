import { requireAuth } from '@/lib/auth';
import { getCanViewModule } from '@/app/actions/modules';
import { getNotes, getNotesPermissions } from '@/app/actions/notes';
import { listFolders } from '@/app/actions/note-folders';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextNotesClient from './ContextNotesClient';

export default async function ContextNotesPage({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams: { folderId?: string };
}) {
  await requireAuth();
  const { projectId } = params;
  const initialFolderId = searchParams.folderId ?? undefined;

  const [{ canView, reason }, permissions, notes, folders] = await Promise.all([
    getCanViewModule(projectId, 'notes'),
    getNotesPermissions(projectId),
    getNotes({ projectId }),
    listFolders(projectId),
  ]);

  if (!canView && reason) {
    return (
      <ModuleDisabledView
        moduleKey="notes"
        projectId={projectId}
        reason={reason}
      />
    );
  }

  return (
    <ContextNotesClient
      projectId={projectId}
      initialNotes={notes}
      initialFolders={folders}
      initialFolderId={initialFolderId}
      permissions={permissions}
    />
  );
}
