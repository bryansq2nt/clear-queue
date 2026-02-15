import { requireAuth } from '@/lib/auth';
import ProjectsPageClient from './ProjectsPageClient';

export default async function ProjectsPage() {
  await requireAuth();
  return <ProjectsPageClient />;
}
