import { requireAuth } from '@/lib/auth'
import { getProjectTodoBoardAction } from '@/app/todo/actions'
import { notFound } from 'next/navigation'
import ProjectBoardClient from './ProjectBoardClient'

export default async function TodoProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  await requireAuth()
  const { projectId } = await params
  const result = await getProjectTodoBoardAction(projectId)

  if (result.error || !result.data) {
    notFound()
  }

  return (
    <ProjectBoardClient
      projectId={projectId}
      initialProjectName={result.data.projectName}
      initialDefaultListId={result.data.defaultListId}
      initialItems={result.data.items}
    />
  )
}
