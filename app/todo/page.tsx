import { requireAuth } from '@/lib/auth';
import { getProjectsForSidebar } from '@/app/actions/projects';
import TodoPageClient from './TodoPageClient';

export default async function TodoPage() {
  await requireAuth();
  const projects = await getProjectsForSidebar();

  return <TodoPageClient initialProjects={projects} />;
}
