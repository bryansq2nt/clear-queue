import { requireAuth } from '@/lib/auth'
import { getBoardById, listBoardItems } from '@/lib/idea-graph/boards'
import { listIdeas } from '@/lib/idea-graph/ideas'
import { deleteBoardAction, addIdeaToBoardAction } from '../actions'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import BoardDetailClient from './BoardDetailClient'

export default async function BoardDetailPage({
  params,
}: {
  params: { id: string }
}) {
  await requireAuth()

  const board = await getBoardById(params.id)

  if (!board) {
    redirect('/ideas/boards')
  }

  const [boardItems, allIdeas] = await Promise.all([
    listBoardItems(params.id),
    listIdeas(),
  ])

  // Get idea details for each board item
  const ideasMap = new Map(allIdeas.map((idea) => [idea.id, idea]))
  const itemsWithIdeas = boardItems.map((item) => ({
    ...item,
    idea: ideasMap.get(item.idea_id),
  }))

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-4">
        <Link
          href="/ideas/boards"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to Boards
        </Link>
      </div>

      <BoardDetailClient
        board={board}
        boardItems={itemsWithIdeas}
        availableIdeas={allIdeas}
      />
    </div>
  )
}
