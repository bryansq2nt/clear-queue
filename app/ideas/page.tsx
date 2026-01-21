import { requireAuth } from '@/lib/auth'
import { listBoards } from '@/lib/idea-graph/boards'
import { listIdeas } from '@/lib/idea-graph/ideas'
import IdeasPageClient from './IdeasPageClient'

export default async function IdeasPage() {
  await requireAuth()

  // Load initial data
  const [boards, ideas] = await Promise.all([
    listBoards(),
    listIdeas(),
  ])

  return (
    <IdeasPageClient initialBoards={boards} initialIdeas={ideas} />
  )
}
