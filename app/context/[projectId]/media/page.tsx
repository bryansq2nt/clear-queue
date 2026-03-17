import { requireAuth } from '@/lib/auth';
import { getCanViewModule } from '@/app/actions/modules';
import { getMedia, getMediaPermissions } from '@/app/actions/media';
import { MEDIA_PAGE_SIZE } from '@/lib/validation/project-media';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextMediaClient from './ContextMediaClient';

export const dynamic = 'force-dynamic';

export default async function ContextMediaPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const { projectId } = params;

  const [{ canView, reason }, permissions, mediaResult] = await Promise.all([
    getCanViewModule(projectId, 'media'),
    getMediaPermissions(projectId),
    getMedia(projectId, { offset: 0, limit: MEDIA_PAGE_SIZE }),
  ]);

  if (!canView && reason) {
    return (
      <ModuleDisabledView
        moduleKey="media"
        projectId={projectId}
        reason={reason}
      />
    );
  }

  return (
    <ContextMediaClient
      projectId={projectId}
      initialMedia={mediaResult.items}
      initialHasMore={mediaResult.hasMore}
      initialLoadedCount={mediaResult.items.length}
      permissions={permissions}
    />
  );
}
