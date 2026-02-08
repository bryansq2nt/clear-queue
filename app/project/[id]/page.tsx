import { requireAuth } from '@/lib/auth'
import ProjectKanbanClient from '@/components/ProjectKanbanClient'

export default async function ProjectPage({
  params,
}: {
  params: { id: string }
}) {
  await requireAuth()

  return <ProjectKanbanClient projectId={params.id} />
}
