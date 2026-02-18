import { requireAuth } from '@/lib/auth';
import ProjectKanbanClient from '@/components/ProjectKanbanClient';
import { getProjectsForSidebar, getProjectById } from '@/app/actions/projects';
import { getTasksByProjectId } from '@/app/actions/tasks';
import { notFound } from 'next/navigation';

export default async function ProjectTasksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAuth();
  const { id } = await params;

  const [projects, project, tasks] = await Promise.all([
    getProjectsForSidebar(),
    getProjectById(id),
    getTasksByProjectId(id),
  ]);

  if (!project) notFound();

  return (
    <ProjectKanbanClient
      key={id}
      projectId={id}
      initialProjects={projects}
      initialProject={project}
      initialTasks={tasks}
      hideTopBar
    />
  );
}
