import { requireAuth } from '@/lib/auth';
import { getProjectsForSidebar } from '@/app/actions/projects';
import { getProjects } from '@/app/budgets/actions';
import { getNotes } from './actions';
import NotesPageClient from './NotesPageClient';

type PageProps = {
  searchParams?: { projectId?: string };
};

export default async function NotesPage(props: PageProps) {
  await requireAuth();
  const projectFilter = props.searchParams?.projectId ?? 'all';

  const [projects, projectList, notes] = await Promise.all([
    getProjectsForSidebar(),
    getProjects(),
    getNotes({
      projectId: projectFilter === 'all' ? undefined : projectFilter,
    }),
  ]);

  return (
    <NotesPageClient
      initialProjects={projects}
      initialProjectList={projectList}
      initialNotes={notes}
      initialProjectFilter={projectFilter}
    />
  );
}
