import { requireAuth } from '@/lib/auth';
import { getIdeaById } from '@/lib/idea-graph/ideas';
import { listProjectLinksForIdea } from '@/lib/idea-graph/project-links';
import { getProjectsByIds, listProjectsForPicker } from '@/lib/projects';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import IdeaDetailClient from './IdeaDetailClient';

export default async function IdeaDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAuth();

  const idea = await getIdeaById(params.id);

  if (!idea) {
    redirect('/ideas');
  }

  const [projectLinks, availableProjects] = await Promise.all([
    listProjectLinksForIdea(params.id),
    listProjectsForPicker(),
  ]);

  // Resolve project names for links
  const projectIds = Array.from(
    new Set(projectLinks.map((link) => link.project_id).filter(Boolean))
  );
  const projects = await getProjectsByIds(projectIds);
  const projectsMap = new Map(projects.map((p) => [p.id, p]));

  // Combine links with project data
  const linksWithProjects = projectLinks.map((link) => ({
    ...link,
    project: projectsMap.get(link.project_id),
  }));

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-4">
        <Link
          href="/ideas"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to Ideas
        </Link>
      </div>

      <IdeaDetailClient
        idea={idea}
        projectLinks={linksWithProjects}
        availableProjects={availableProjects}
      />
    </div>
  );
}
