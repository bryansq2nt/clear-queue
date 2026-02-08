import { requireAuth } from '@/lib/auth'
import { getTodoListWithItemsAction } from '@/app/todo/actions'
import { notFound } from 'next/navigation'
import ListBoardClient from './ListBoardClient'

export default async function TodoListPage({
  params,
}: {
  params: Promise<{ listId: string }>
}) {
  await requireAuth()
  const { listId } = await params
  const result = await getTodoListWithItemsAction(listId)

  if (result.error || !result.data) {
    notFound()
  }

  const { list, items, projectName } = result.data
  if (!list) {
    notFound()
  }

  return (
    <ListBoardClient
      listId={list.id}
      initialListTitle={list.title}
      initialProjectId={list.project_id ?? null}
      initialProjectName={projectName}
      initialItems={items}
    />
  )
}
