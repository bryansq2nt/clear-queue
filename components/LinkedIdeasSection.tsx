import { listProjectLinksForProject } from '@/lib/idea-graph/project-links'
import { getIdeasByIds } from '@/lib/idea-graph/ideas'
import Link from 'next/link'
import UnlinkButton from './UnlinkIdeaButton'

/**
 * Component to display linked ideas for a project
 * This is a server component that can be integrated into project pages
 */
export default async function LinkedIdeasSection({
  projectId,
}: {
  projectId: string
}) {
  const projectLinks = await listProjectLinksForProject(projectId)

  if (projectLinks.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-xl font-semibold mb-4">Linked Ideas</h2>
        <p className="text-muted-foreground">
          No ideas are linked to this project yet.
        </p>
      </div>
    )
  }

  // Get unique idea IDs
  const ideaIds = Array.from(
    new Set(projectLinks.map((link) => link.idea_id).filter(Boolean))
  )

  // Fetch all ideas in one query
  const ideas = await getIdeasByIds(ideaIds)
  const ideasMap = new Map(ideas.map((idea) => [idea.id, idea]))

  // Combine links with idea data
  const linksWithIdeas = projectLinks
    .map((link) => ({
      ...link,
      idea: ideasMap.get(link.idea_id),
    }))
    .filter((link) => link.idea) // Only include links with valid ideas

  return (
    <div className="bg-white rounded-lg border p-6">
      <h2 className="text-xl font-semibold mb-4">Linked Ideas</h2>
      <div className="space-y-2">
        {linksWithIdeas.map((link) => (
          <div
            key={link.id}
            className="flex items-center justify-between p-3 bg-muted rounded-md"
          >
            <div className="flex-1">
              <Link
                href={`/ideas/${link.idea!.id}`}
                className="font-medium hover:text-primary"
              >
                {link.idea!.title}
              </Link>
              {link.role && (
                <p className="text-sm text-muted-foreground">Role: {link.role}</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <p className="text-xs text-muted-foreground">
                {new Date(link.created_at).toLocaleDateString()}
              </p>
              <UnlinkButton linkId={link.id} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
