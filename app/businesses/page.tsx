import { requireAuth } from '@/lib/auth';
import { getProjectsForSidebar } from '@/app/actions/projects';
import { getBusinesses } from '@/app/clients/actions';
import BusinessesPageClient from './BusinessesPageClient';

export default async function BusinessesPage() {
  await requireAuth();
  const [projects, businesses] = await Promise.all([
    getProjectsForSidebar(),
    getBusinesses(),
  ]);

  return (
    <BusinessesPageClient
      initialProjects={projects}
      initialBusinesses={businesses}
    />
  );
}
