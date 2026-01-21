'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Plus, Layout, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { deleteBoardAction } from './boards/actions'
import { useRouter } from 'next/navigation'

interface Board {
  id: string
  name: string
  description: string | null
}

export default function BoardsSidebar({
  boards,
  selectedBoardId,
  onSelectBoard,
  onRefresh,
}: {
  boards: Board[]
  selectedBoardId: string | null
  onSelectBoard: (boardId: string | null) => void
  onRefresh: () => void
}) {
  const router = useRouter()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = async (boardId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Delete this board? This will not delete the ideas, only the board view.')) {
      return
    }

    setDeletingId(boardId)
    const result = await deleteBoardAction(boardId)
    setDeletingId(null)

    if (result.success) {
      if (selectedBoardId === boardId) {
        const nextBoard = boards.find((b) => b.id !== boardId)
        onSelectBoard(nextBoard?.id || null)
      }
      onRefresh()
    }
  }

  return (
    <div className="w-64 bg-white border-r border-slate-200 flex flex-col overflow-y-auto">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
            Boards
          </h3>
        </div>

        <div className="space-y-1">
          {boards.length === 0 ? (
            <p className="text-sm text-muted-foreground px-2">
              No boards yet. Create one to get started.
            </p>
          ) : (
            boards.map((board) => (
              <div
                key={board.id}
                className={cn(
                  'group flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer',
                  selectedBoardId === board.id
                    ? 'bg-slate-100 text-slate-900 font-medium'
                    : 'text-slate-600 hover:bg-slate-50'
                )}
                onClick={() => onSelectBoard(board.id)}
              >
                <Layout className="w-4 h-4 flex-shrink-0" />
                <span className="truncate flex-1">{board.name}</span>
                <button
                  onClick={(e) => handleDelete(board.id, e)}
                  disabled={deletingId === board.id}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 rounded transition-opacity flex-shrink-0"
                  title="Delete board"
                >
                  <Trash2 className="w-4 h-4 text-red-600" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
