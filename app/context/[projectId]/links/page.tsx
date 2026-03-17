import { requireAuth } from '@/lib/auth';
import { getCanViewModule } from '@/app/actions/modules';
import {
  getLinksPermissions,
  listProjectLinksAction,
  listLinkCategoriesAction,
} from './actions';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextLinksClient from './ContextLinksClient';

export default async function ContextLinksPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const { projectId } = params;

  const [{ canView, reason }, permissions, links, categories] =
    await Promise.all([
      getCanViewModule(projectId, 'links'),
      getLinksPermissions(projectId),
      listProjectLinksAction(projectId),
      listLinkCategoriesAction(),
    ]);

  if (!canView && reason) {
    return (
      <ModuleDisabledView
        moduleKey="links"
        projectId={projectId}
        reason={reason}
      />
    );
  }

  return (
    <ContextLinksClient
      projectId={projectId}
      initialLinks={links}
      initialCategories={categories}
      permissions={permissions}
    />
  );
}
