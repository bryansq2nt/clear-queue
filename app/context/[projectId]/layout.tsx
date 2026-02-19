import { requireAuth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getProjectById } from '@/app/actions/projects';
import ContextLayoutClient from './ContextLayoutClient';

export default async function ContextProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { projectId: string };
}) {
  await requireAuth();
  const projectId = params.projectId;
  const project = await getProjectById(projectId);

  if (!project) {
    redirect('/context');
  }

  return (
    <ContextLayoutClient
      projectId={projectId}
      projectName={project.name}
    >
      {children}
    </ContextLayoutClient>
  );
}
