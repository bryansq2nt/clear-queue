import { requireAuth } from '@/lib/auth';
import ProjectKanbanClient from '@/components/ProjectKanbanClient';
import { getProjectsForSidebar, getProjectById } from '@/app/actions/projects';
import { getTasksByProjectId } from '@/app/actions/tasks';

export default async function ProjectPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAuth();
  const id = params.id;

  const [projects, project, tasks] = await Promise.all([
    getProjectsForSidebar(),
    getProjectById(id),
    getTasksByProjectId(id),
  ]);

  return (
    <ProjectKanbanClient
      key={id}
      projectId={id}
      initialProjects={projects}
      initialProject={project}
      initialTasks={tasks}
    />
  );
}
