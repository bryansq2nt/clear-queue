'use client'

import { useState, useEffect, useCallback } from 'react'
import { useI18n } from '@/components/I18nProvider'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Plus } from 'lucide-react'
import BoardsSidebar from './BoardsSidebar'
import IdeaGraphCanvas from './IdeaGraphCanvas'
import IdeaDrawer from './IdeaDrawer'
import { createIdeaAction } from './actions'
import {
  createBoardAction,
  updateBoardAction,
  addIdeaToBoardAction,
} from './boards/actions'
import { loadBoardDataAction } from './load-board-data'

interface Idea {
  id: string
  title: string
  description: string | null
}

interface Board {
  id: string
  name: string
  description: string | null
  project_id?: string | null
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
  initialProjects = [],
}: {
  initialBoards: Board[]
  initialIdeas: Idea[]
  initialProjects?: { id: string; name: string }[]
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
  const [isEditingBoard, setIsEditingBoard] = useState(false)
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
      if (result.board) {
        setBoards((prev) =>
          prev.map((b) =>
            b.id === result.board!.id ? { ...b, ...result.board } : b
          )
        )
      }
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

  const selectedBoard = selectedBoardId
    ? boards.find((b) => b.id === selectedBoardId)
    : null

  const handleUpdateBoard = async (formData: FormData) => {
    if (!selectedBoardId) return
    formData.set('id', selectedBoardId)
    const result = await updateBoardAction(formData)
    if (result.data) {
      setBoards((prev) =>
        prev.map((b) =>
          b.id === selectedBoardId ? { ...b, ...result.data } : b
        )
      )
      setIsEditingBoard(false)
      router.refresh()
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
        isCreatingBoard={isCreatingBoard}
        newBoardName={newBoardName}
        onNewBoardNameChange={setNewBoardName}
        onCreateBoard={handleCreateBoard}
        onCancelNewBoard={() => {
          setIsCreatingBoard(false)
          setNewBoardName('')
        }}
        onStartCreateBoard={() => setIsCreatingBoard(true)}
        onEditBoard={(boardId) => {
          setSelectedBoardId(boardId)
          setIsEditingBoard(true)
        }}
      />

      {/* Main Canvas Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-card border-b border-border p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            {isEditingBoard && selectedBoard ? (
              <form
                action={handleUpdateBoard}
                className="flex flex-wrap items-end gap-3 flex-1 min-w-0"
              >
                <input type="hidden" name="id" value={selectedBoard.id} />
                <div className="flex flex-col gap-1">
                  <Input
                    name="name"
                    defaultValue={selectedBoard.name}
                    placeholder={t('ideas.board_name_placeholder')}
                    className="w-48"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Textarea
                    name="description"
                    defaultValue={selectedBoard.description ?? ''}
                    placeholder={t('ideas.board_description_placeholder')}
                    rows={1}
                    className="w-48 min-h-9 resize-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <select
                    name="projectId"
                    defaultValue={selectedBoard.project_id ?? ''}
                    className="flex h-9 w-48 rounded-md border border-input bg-background px-3 py-1 text-sm"
                  >
                    <option value="">{t('ideas.no_project')}</option>
                    {initialProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-muted-foreground">
                    {t('ideas.link_board_to_project')}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm">
                    {t('common.save')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setIsEditingBoard(false)}
                  >
                    {t('common.cancel')}
                  </Button>
                </div>
              </form>
            ) : (
              <h2 className="text-lg font-semibold text-foreground truncate min-w-0">
                {selectedBoardId
                  ? selectedBoard?.name || t('ideas.select_board')
                  : t('ideas.select_board')}
              </h2>
            )}
            {!isEditingBoard && (
            <div className="flex items-center gap-2">
              {isCreatingIdea ? (
                <form action={handleCreateIdea} className="flex items-center gap-2">
                  <Input
                    name="title"
                    placeholder={t('ideas.new_word_placeholder')}
                    required
                    className="w-48"
                    autoFocus
                  />
                  <Button size="sm" type="submit">
                    {t('common.add')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={() => setIsCreatingIdea(false)}
                  >
                    {t('common.cancel')}
                  </Button>
                </form>
              ) : (
                <Button
                  size="sm"
                  onClick={() => setIsCreatingIdea(true)}
                  disabled={!selectedBoardId}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {t('ideas.add_word')}
                </Button>
              )}
            </div>
            )}
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
