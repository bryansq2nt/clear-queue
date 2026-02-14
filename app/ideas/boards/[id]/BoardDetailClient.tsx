'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DetailLayout } from '@/components/DetailLayout'
import { useI18n } from '@/components/I18nProvider'
import { deleteBoardAction, addIdeaToBoardAction } from '../actions'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Board {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

interface Idea {
  id: string
  title: string
  description: string | null
}

interface BoardItem {
  id: string
  idea_id: string
  x: number
  y: number
  idea?: Idea
}

export default function BoardDetailClient({
  board,
  boardItems,
  availableIdeas,
}: {
  board: Board
  boardItems: BoardItem[]
  availableIdeas: Idea[]
}) {
  const { t } = useI18n()
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    if (
      !confirm(
        'Are you sure you want to delete this board? This action cannot be undone.'
      )
    ) {
      return
    }

    setIsDeleting(true)
    const result = await deleteBoardAction(board.id)

    if (result.success) {
      router.push('/ideas/boards')
    } else if (result.error) {
      alert(result.error)
      setIsDeleting(false)
    }
  }

  async function handleAddIdea(formData: FormData) {
    setError(null)
    formData.append('boardId', board.id)

    const result = await addIdeaToBoardAction(formData)

    if (result.data) {
      // Reset form
      const form = document.getElementById('add-idea-form') as HTMLFormElement
      form?.reset()
      router.refresh()
    } else if (result.error) {
      setError(result.error)
    }
  }

  // Filter out ideas that are already in the board
  const existingIdeaIds = new Set(boardItems.map((item) => item.idea_id))
  const availableIdeasToAdd = availableIdeas.filter(
    (idea) => !existingIdeaIds.has(idea.id)
  )

  return (
    <DetailLayout
      backHref="/ideas/boards"
      backLabel={t('ideas.back_to_boards')}
      title={board.name}
      actions={
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDelete}
          disabled={isDeleting}
        >
          {isDeleting ? t('common.loading') : t('common.delete')}
        </Button>
      }
      contentClassName="p-4 sm:p-6 max-w-4xl mx-auto"
    >
      <div className="space-y-6">
      {board.description && (
        <div className="bg-card rounded-lg border border-border p-4">
          <p className="text-muted-foreground whitespace-pre-wrap text-sm">
            {board.description}
          </p>
        </div>
      )}
        <div className="text-sm text-muted-foreground">
          <p>Created: {new Date(board.created_at).toLocaleString()}</p>
          {board.updated_at !== board.created_at && (
            <p>Updated: {new Date(board.updated_at).toLocaleString()}</p>
          )}
        </div>
      </div>

      {/* Add Idea to Board */}
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-xl font-semibold mb-4">Add idea to this board</h2>
        <form
          id="add-idea-form"
          action={handleAddIdea}
          className="space-y-4"
        >
          <div>
            <label
              htmlFor="ideaId"
              className="block text-sm font-medium mb-2"
            >
              Idea <span className="text-red-500">*</span>
            </label>
            {availableIdeasToAdd.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                All available ideas are already in this board.
              </p>
            ) : (
              <select
                id="ideaId"
                name="ideaId"
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">Select an idea...</option>
                {availableIdeasToAdd.map((idea) => (
                  <option key={idea.id} value={idea.id}>
                    {idea.title}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="x" className="block text-sm font-medium mb-2">
                X Position (optional)
              </label>
              <Input
                id="x"
                name="x"
                type="number"
                step="0.1"
                placeholder="0"
              />
            </div>
            <div>
              <label htmlFor="y" className="block text-sm font-medium mb-2">
                Y Position (optional)
              </label>
              <Input
                id="y"
                name="y"
                type="number"
                step="0.1"
                placeholder="0"
              />
            </div>
          </div>
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
              {error}
            </div>
          )}
          <Button
            type="submit"
            disabled={availableIdeasToAdd.length === 0}
          >
            Add Idea to Board
          </Button>
        </form>
      </div>

      {/* Board Items */}
      <div className="bg-card rounded-lg border border-border p-4 sm:p-6">
        <h2 className="text-xl font-semibold mb-4">Board items</h2>
        {boardItems.length === 0 ? (
          <p className="text-muted-foreground">
            No ideas have been added to this board yet.
          </p>
        ) : (
          <div className="space-y-3">
            {boardItems.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between p-4 bg-muted rounded-md"
              >
                <div className="flex-1">
                  {item.idea ? (
                    <Link
                      href={`/ideas/${item.idea.id}`}
                      className="block hover:text-primary"
                    >
                      <h3 className="font-semibold mb-1">
                        {item.idea.title}
                      </h3>
                      {item.idea.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {item.idea.description}
                        </p>
                      )}
                    </Link>
                  ) : (
                    <div>
                      <h3 className="font-semibold mb-1">
                        Idea ID: {item.idea_id}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        (Idea not found)
                      </p>
                    </div>
                  )}
                </div>
                <div className="ml-4 text-sm text-muted-foreground">
                  <p>X: {item.x}</p>
                  <p>Y: {item.y}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DetailLayout>
  )
}
