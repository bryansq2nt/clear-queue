import { requireAuth } from '@/lib/auth';
import {
  getProjectsList,
  getProjectsForSidebar,
  getFavoriteProjectIds,
} from '@/app/actions/projects';
import { getClients } from '@/app/clients/actions';
import ProjectsPageClient from './ProjectsPageClient';

export default async function ProjectsPage() {
  await requireAuth();
  const [projectsList, projectRows, clientsRes, favoritesRes] =
    await Promise.all([
      getProjectsList(),
      getProjectsForSidebar(),
      getClients(),
      getFavoriteProjectIds(),
    ]);
  return (
    <ProjectsPageClient
      initialProjects={projectsList}
      initialProjectRows={projectRows}
      initialClients={clientsRes}
      initialFavoriteIds={favoritesRes.data ?? []}
    />
  );
}
