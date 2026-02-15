import { requireAuth } from '@/lib/auth';
import { getProjectsForSidebar } from '@/app/actions/projects';
import { getClients } from './actions';
import ClientsPageClient from './ClientsPageClient';

export default async function ClientsPage() {
  await requireAuth();
  const [projects, clients] = await Promise.all([
    getProjectsForSidebar(),
    getClients(),
  ]);

  return (
    <ClientsPageClient initialProjects={projects} initialClients={clients} />
  );
}
