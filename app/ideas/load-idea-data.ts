'use server'

import { requireAuth } from '@/lib/auth'
import { getIdeaById } from '@/lib/idea-graph/ideas'
import { listProjectLinksForIdea } from '@/lib/idea-graph/project-links'
import { getProjectsByIds, listProjectsForPicker } from '@/lib/projects'

export async function loadIdeaDataAction(ideaId: string) {
  await requireAuth()

  const [idea, projectLinks, availableProjects] = await Promise.all([
    getIdeaById(ideaId),
    listProjectLinksForIdea(ideaId),
    listProjectsForPicker(),
  ])

  if (!idea) {
    return { error: 'Idea not found' }
  }

  // Resolve project names
  const projectIds = Array.from(
    new Set(projectLinks.map((link) => link.project_id).filter(Boolean))
  )
  const projects = await getProjectsByIds(projectIds)
  const projectsMap = new Map(projects.map((p) => [p.id, p]))

  const linksWithProjects = projectLinks.map((link) => ({
    ...link,
    project: projectsMap.get(link.project_id),
  }))

  // Filter out already linked projects
  const linkedIds = new Set(projectLinks.map((l) => l.project_id))
  const available = availableProjects.filter((p) => !linkedIds.has(p.id))

  return {
    idea,
    projectLinks: linksWithProjects,
    availableProjects: available,
  }
}
