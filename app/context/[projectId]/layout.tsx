import { requireAuth } from '@/lib/auth';
import {
  getProjectModules,
  getMyProjectAccessGrant,
  getCanToggleModules,
} from '@/app/actions/modules';
import ContextLayoutWrapper from './ContextLayoutWrapper';

export default async function ContextProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { projectId: string };
}) {
  await requireAuth();
  const projectId = params.projectId;

  // Fetch server-side so the first render already has the correct restricted
  // module list. Without this, ContextLayoutWrapper starts with DEFAULT_MODULES
  // (all tabs visible) and flashes the wrong tabs until the client fetch resolves.
  const [initialModules, initialAccessGrant, initialCanToggle] =
    await Promise.all([
      getProjectModules(projectId),
      getMyProjectAccessGrant(projectId),
      getCanToggleModules(projectId),
    ]);

  return (
    <ContextLayoutWrapper
      projectId={projectId}
      initialModules={initialModules}
      initialAccessGrant={initialAccessGrant}
      initialCanToggle={initialCanToggle}
    >
      {children}
    </ContextLayoutWrapper>
  );
}
