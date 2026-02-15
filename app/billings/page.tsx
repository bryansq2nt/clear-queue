import { requireAuth } from '@/lib/auth';
import { getProjectsForSidebar } from '@/app/actions/projects';
import { getClients } from '@/app/clients/actions';
import { getBillings } from './actions';
import BillingsPageClient from './BillingsPageClient';

export default async function BillingsPage() {
  await requireAuth();
  const [projects, clients, billings] = await Promise.all([
    getProjectsForSidebar(),
    getClients(),
    getBillings(),
  ]);

  return (
    <BillingsPageClient
      initialProjects={projects}
      initialClients={clients}
      initialBillings={billings}
    />
  );
}
