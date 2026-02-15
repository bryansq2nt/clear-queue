import { requireAuth } from '@/lib/auth';
import { getProjectsForSidebar } from '@/app/actions/projects';
import { listBoards } from '@/lib/idea-graph/boards';
import { listIdeas } from '@/lib/idea-graph/ideas';
import { listProjectsForPicker } from '@/lib/projects';
import IdeasPageClient from './IdeasPageClient';

export default async function IdeasPage() {
  await requireAuth();

  const [sidebarProjects, boards, ideas, projects] = await Promise.all([
    getProjectsForSidebar(),
    listBoards(),
    listIdeas(),
    listProjectsForPicker(),
  ]);

  return (
    <IdeasPageClient
      initialSidebarProjects={sidebarProjects}
      initialBoards={boards}
      initialIdeas={ideas}
      initialProjects={projects}
    />
  );
}
