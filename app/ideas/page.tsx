import { requireAuth } from '@/lib/auth';
import { listBoards } from '@/lib/idea-graph/boards';
import { listIdeas } from '@/lib/idea-graph/ideas';
import { listProjectsForPicker } from '@/lib/projects';
import IdeasPageClient from './IdeasPageClient';

export default async function IdeasPage() {
  await requireAuth();

  const [boards, ideas, projects] = await Promise.all([
    listBoards(),
    listIdeas(),
    listProjectsForPicker(),
  ]);

  return (
    <IdeasPageClient
      initialBoards={boards}
      initialIdeas={ideas}
      initialProjects={projects}
    />
  );
}
