'use client'

import { useState, useEffect, useCallback } from 'react'
import { useI18n } from '@/components/I18nProvider'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Lightbulb, Layout } from 'lucide-react'
import BoardsSidebar from './BoardsSidebar'
import IdeaGraphCanvas from './IdeaGraphCanvas'
import IdeaDrawer from './IdeaDrawer'
import { createIdeaAction } from './actions'
import { createBoardAction } from './boards/actions'
import { loadBoardDataAction } from './load-board-data'
import { addIdeaToBoardAction } from './boards/actions'

interface Idea {
  id: string
  title: string
  description: string | null
}

interface Board {
  id: string
  name: string
  description: string | null
}

interface BoardItem {
  id: string
  idea_id: string
  x: number
  y: number
  idea: Idea
}

interface Connection {
  id: string
  from_idea_id: string
  to_idea_id: string
  type: string
}

export default function IdeasDashboardClient({
  initialBoards,
  initialIdeas,
}: {
  initialBoards: Board[]
  initialIdeas: Idea[]
}) {
  const { t } = useI18n()
  const router = useRouter()
  const [boards, setBoards] = useState(initialBoards)
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(
    initialBoards.length > 0 ? initialBoards[0].id : null
  )
  const [boardItems, setBoardItems] = useState<BoardItem[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null)
  const [isCreatingIdea, setIsCreatingIdea] = useState(false)
  const [isCreatingBoard, setIsCreatingBoard] = useState(false)
  const [newBoardName, setNewBoardName] = useState('')
  const [loading, setLoading] = useState(false)

  // Load board data when board is selected
  const loadBoardData = useCallback(async (boardId: string) => {
    setLoading(true)
    try {
      const result = await loadBoardDataAction(boardId)
      if (result.error) {
        console.error('Failed to load board:', result.error)
        return
      }
      // Filter out items without valid ideas (type-safe)
      const items = result.items || []
      const validItems: BoardItem[] = items
        .map((item) => {
          if (!item.idea) return null
          return {
            id: item.id,
            idea_id: item.idea_id,
            x: item.x,
            y: item.y,
            idea: {
              id: item.idea.id,
              title: item.idea.title,
              description: item.idea.description,
            },
          }
        })
        .filter((item): item is BoardItem => item !== null)
      setBoardItems(validItems)
      setConnections(result.connections || [])
    } catch (error) {
      console.error('Failed to load board data:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedBoardId) {
      loadBoardData(selectedBoardId)
    }
  }, [selectedBoardId, loadBoardData])

  const handleCreateIdea = async (formData: FormData) => {
    const result = await createIdeaAction(formData)
    if (result.data && selectedBoardId) {
      // Add idea to current board at default position
      const addFormData = new FormData()
      addFormData.append('boardId', selectedBoardId)
      addFormData.append('ideaId', result.data.id)
      addFormData.append('x', '400')
      addFormData.append('y', '300')
      await addIdeaToBoardAction(addFormData)
      router.refresh()
      setIsCreatingIdea(false)
      // Reload board data
      if (selectedBoardId) {
        loadBoardData(selectedBoardId)
      }
    }
  }

  const handleCreateBoard = async () => {
    if (!newBoardName.trim()) return

    const formData = new FormData()
    formData.append('name', newBoardName)
    const result = await createBoardAction(formData)
    if (result.data) {
      setBoards([result.data, ...boards])
      setSelectedBoardId(result.data.id)
      setNewBoardName('')
      setIsCreatingBoard(false)
      router.refresh()
    }
  }

  const handleNodeClick = (ideaId: string) => {
    setSelectedIdeaId(ideaId)
  }

  const handleCloseDrawer = () => {
    setSelectedIdeaId(null)
  }

  const handleRefresh = () => {
    router.refresh()
    if (selectedBoardId) {
      loadBoardData(selectedBoardId)
    }
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Boards Sidebar */}
      <BoardsSidebar
        boards={boards}
        selectedBoardId={selectedBoardId}
        onSelectBoard={setSelectedBoardId}
        onRefresh={handleRefresh}
      />

      {/* Main Canvas Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-card border-b border-border p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              {selectedBoardId
                ? boards.find((b) => b.id === selectedBoardId)?.name ||
                'Select a Board'
                : 'Select a Board'}
            </h2>
            <div className="flex items-center gap-2">
              {isCreatingBoard ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={newBoardName}
                    onChange={(e) => setNewBoardName(e.target.value)}
                    placeholder="Board name..."
                    className="w-48"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateBoard()
                      if (e.key === 'Escape') {
                        setIsCreatingBoard(false)
                        setNewBoardName('')
                      }
                    }}
                    autoFocus
                  />
                  <Button size="sm" onClick={handleCreateBoard}>
                    Create
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setIsCreatingBoard(false)
                      setNewBoardName('')
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <>
                  {isCreatingIdea ? (
                    <form action={handleCreateIdea} className="flex items-center gap-2">
                      <Input
                        name="title"
                        placeholder="Nueva palabra..."
                        required
                        className="w-48"
                        autoFocus
                      />
                      <Button size="sm" type="submit">
                        Create
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        onClick={() => setIsCreatingIdea(false)}
                      >
                        Cancel
                      </Button>
                    </form>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        onClick={() => setIsCreatingIdea(true)}
                        disabled={!selectedBoardId}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Agregar Palabra
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsCreatingBoard(true)}
                      >
                        <Layout className="w-4 h-4 mr-2" />
                        New Board
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 relative">
          {selectedBoardId ? (
            <IdeaGraphCanvas
              boardId={selectedBoardId}
              items={boardItems}
              connections={connections}
              onNodeClick={handleNodeClick}
              onRefresh={handleRefresh}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-muted-foreground">
                {t('ideas.select_board_or_create')}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Idea Drawer */}
      {selectedIdeaId && (
        <IdeaDrawer
          ideaId={selectedIdeaId}
          isOpen={!!selectedIdeaId}
          onClose={handleCloseDrawer}
          onUpdate={handleRefresh}
        />
      )}
    </div>
  )
}
