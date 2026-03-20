import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import {
  getProjectModules,
  getMyProjectAccessGrant,
  getCanToggleModules,
} from '@/app/actions/modules';
import { getProjectById } from '@/app/actions/projects';
import ContextLayoutWrapper from './ContextLayoutWrapper';

export default async function ContextProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { projectId: string };
}) {
  const user = await requireAuth();
  const projectId = params.projectId;

  const [project, initialModules, initialAccessGrant, initialCanToggle] =
    await Promise.all([
      getProjectById(projectId),
      getProjectModules(projectId),
      getMyProjectAccessGrant(projectId),
      getCanToggleModules(projectId),
    ]);

  if (!project) notFound();

  return (
    <ContextLayoutWrapper
      projectId={projectId}
      project={project}
      initialModules={initialModules}
      initialAccessGrant={initialAccessGrant}
      initialCanToggle={initialCanToggle}
      initialCanDeleteProject={project.owner_id === user.id}
    >
      {children}
    </ContextLayoutWrapper>
  );
}
