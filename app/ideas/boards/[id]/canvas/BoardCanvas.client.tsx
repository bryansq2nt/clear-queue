'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { updatePositionAction } from './actions'
import {
  createConnectionAction,
  deleteConnectionAction,
} from './connection-actions'

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
  idea: Idea
}

interface Connection {
  id: string
  from_idea_id: string
  to_idea_id: string
  type: string
}

export default function BoardCanvasClient({
  items,
  connections,
}: {
  items: BoardItem[]
  connections: Connection[]
}) {
  // World dimensions
  const WORLD_WIDTH = 2000
  const WORLD_HEIGHT = 2000

  // Node dimensions (w-48 = 192px, approximate height)
  const NODE_WIDTH = 192
  const NODE_HEIGHT = 80

  // Drag state
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(
    new Map(items.map((item) => [item.id, { x: item.x, y: item.y }]))
  )
  const [isSaving, setIsSaving] = useState<string | null>(null)
  const [hasDragged, setHasDragged] = useState(false)
  const [connectionMode, setConnectionMode] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Get current position for an item (either from state or initial)
  const getPosition = useCallback(
    (itemId: string) => {
      const pos = positions.get(itemId)
      if (pos) return pos
      const item = items.find((i) => i.id === itemId)
      return item ? { x: item.x, y: item.y } : { x: 0, y: 0 }
    },
    [positions, items]
  )

  // Create a map: ideaId -> boardItemId for quick lookup
  const ideaToItemMap = useMemo(
    () => new Map(items.map((item) => [item.idea_id, item.id])),
    [items]
  )

  // Get position by idea ID (for connections)
  const getPositionByIdeaId = useCallback(
    (ideaId: string) => {
      const itemId = ideaToItemMap.get(ideaId)
      if (!itemId) return null
      return getPosition(itemId)
    },
    [ideaToItemMap, getPosition]
  )

  // Handle context menu (right click) to start connection
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, ideaId: string) => {
      e.preventDefault()
      e.stopPropagation()

      if (connectionMode === ideaId) {
        // Cancel connection mode if clicking the same node
        setConnectionMode(null)
      } else {
        // Start connection from this node
        setConnectionMode(ideaId)
      }
    },
    [connectionMode]
  )

  // Handle click on node (for completing connection or navigation)
  const handleNodeClick = useCallback(
    async (e: React.MouseEvent, ideaId: string) => {
      // If in connection mode, create connection
      if (connectionMode && connectionMode !== ideaId) {
        e.preventDefault()
        e.stopPropagation()

        const result = await createConnectionAction(connectionMode, ideaId)

        if (result.error) {
          alert(`Failed to create connection: ${result.error}`)
        } else {
          // Refresh to get updated connections
          router.refresh()
        }

        setConnectionMode(null)
        return
      }

      // If we dragged, prevent navigation
      if (hasDragged) {
        e.preventDefault()
      }
    },
    [connectionMode, hasDragged, router]
  )

  // Handle mouse down on a node
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, itemId: string) => {
      // Don't start drag if in connection mode
      if (connectionMode) {
        return
      }

      // Prevent default link behavior
      e.preventDefault()
      e.stopPropagation()

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const containerRect = containerRef.current?.getBoundingClientRect()

      if (!containerRect) return

      // Calculate offset from mouse to node top-left
      const offsetX = e.clientX - rect.left
      const offsetY = e.clientY - rect.top

      setDragOffset({ x: offsetX, y: offsetY })
      setDraggingNodeId(itemId)
      setHasDragged(false)
    },
    [connectionMode]
  )

  // Handle click on connection line to delete
  const handleConnectionClick = useCallback(
    async (e: React.MouseEvent, connectionId: string) => {
      e.preventDefault()
      e.stopPropagation()

      if (
        !confirm(
          'Are you sure you want to delete this connection? This action cannot be undone.'
        )
      ) {
        return
      }

      const result = await deleteConnectionAction(connectionId)

      if (result.error) {
        alert(`Failed to delete connection: ${result.error}`)
      } else {
        // Refresh to get updated connections
        router.refresh()
      }
    },
    [router]
  )

  // Handle mouse move
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!draggingNodeId || !containerRef.current) return

      setHasDragged(true)

      const containerRect = containerRef.current.getBoundingClientRect()
      const newX = e.clientX - containerRect.left - dragOffset.x
      const newY = e.clientY - containerRect.top - dragOffset.y

      // Update position optimistically
      setPositions((prev) => {
        const next = new Map(prev)
        next.set(draggingNodeId, { x: newX, y: newY })
        return next
      })
    },
    [draggingNodeId, dragOffset]
  )

  // Handle mouse up
  const handleMouseUp = useCallback(
    async (e: MouseEvent) => {
      if (!draggingNodeId) return

      const itemIdToSave = draggingNodeId
      const wasDragging = hasDragged
      const finalPos = getPosition(itemIdToSave)

      // Reset drag state immediately
      setDraggingNodeId(null)
      setIsSaving(itemIdToSave)

      // If we dragged, prevent link navigation
      if (wasDragging) {
        e.preventDefault()
        setHasDragged(false)
      }

      // Persist to database
      const result = await updatePositionAction(
        itemIdToSave,
        finalPos.x,
        finalPos.y
      )

      setIsSaving(null)

      if (result.error) {
        // Revert to original position on error
        const originalItem = items.find((i) => i.id === itemIdToSave)
        if (originalItem) {
          setPositions((prev) => {
            const next = new Map(prev)
            next.set(itemIdToSave, { x: originalItem.x, y: originalItem.y })
            return next
          })
        }
        alert(`Failed to save position: ${result.error}`)
      }
    },
    [draggingNodeId, hasDragged, getPosition, items]
  )

  // Sync positions when items change (e.g., after server refresh)
  useEffect(() => {
    setPositions(new Map(items.map((item) => [item.id, { x: item.x, y: item.y }])))
  }, [items])

  // Set up global mouse event listeners for drag
  useEffect(() => {
    if (!draggingNodeId) return

    const handleMove = (e: MouseEvent) => handleMouseMove(e)
    const handleUp = (e: MouseEvent) => handleMouseUp(e)

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'

    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [draggingNodeId, handleMouseMove, handleMouseUp])

  // Handle ESC to cancel connection mode
  useEffect(() => {
    if (!connectionMode) return

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setConnectionMode(null)
      }
    }

    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [connectionMode])

  return (
    <div
      className="flex-1 overflow-auto bg-background"
      ref={containerRef}
      onClick={(e) => {
        // Cancel connection mode if clicking on canvas (not on a node)
        if (connectionMode && e.target === containerRef.current) {
          setConnectionMode(null)
        }
      }}
    >
      {/* Connection mode indicator */}
      {connectionMode && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 bg-primary text-primary-foreground px-4 py-2 rounded-md shadow-lg">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">
              Connection mode: Click another node to connect (ESC to cancel)
            </span>
            <button
              onClick={() => setConnectionMode(null)}
              className="text-sm underline hover:no-underline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div
        className="relative"
        style={{
          width: WORLD_WIDTH,
          height: WORLD_HEIGHT,
          minWidth: WORLD_WIDTH,
          minHeight: WORLD_HEIGHT,
        }}
      >
        {/* Layer 1: Connections - rendered behind nodes */}
        <div className="absolute inset-0 z-0 pointer-events-none [&_line]:pointer-events-auto">
          <svg
            className="absolute top-0 left-0"
            style={{
              width: WORLD_WIDTH,
              height: WORLD_HEIGHT,
            }}
          >
            {connections.map((conn) => {
            const fromPos = getPositionByIdeaId(conn.from_idea_id)
            const toPos = getPositionByIdeaId(conn.to_idea_id)

            if (!fromPos || !toPos) return null

            // Calculate center points of nodes
            const x1 = fromPos.x + NODE_WIDTH / 2
            const y1 = fromPos.y + NODE_HEIGHT / 2
            const x2 = toPos.x + NODE_WIDTH / 2
            const y2 = toPos.y + NODE_HEIGHT / 2

            return (
              <line
                key={conn.id}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#94a3b8"
                strokeWidth={4}
                strokeDasharray={conn.type === 'relates_to' ? '0' : '5,5'}
                cursor="pointer"
                onClick={(e) => handleConnectionClick(e, conn.id)}
                className="hover:stroke-slate-600"
              />
            )
          })}
          </svg>
        </div>

        {/* Layer 2: Nodes - always on top */}
        {items.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-muted-foreground">
              No ideas on this board yet. Add ideas from the board detail page.
            </p>
          </div>
        ) : (
          <div className="absolute inset-0 z-[100]">
          {items.map((item) => {
            const pos = getPosition(item.id)
            const isDragging = draggingNodeId === item.id
            const isSavingThis = isSaving === item.id
            const isConnectionSource = connectionMode === item.idea.id
            const isConnectionTarget =
              connectionMode && connectionMode !== item.idea.id

            return (
              <div
                key={item.id}
                className="absolute"
                style={{
                  left: pos.x,
                  top: pos.y,
                  zIndex: isDragging ? 200 : 100,
                  opacity: isSavingThis ? 0.7 : 1,
                }}
              >
                <Link
                  href={`/ideas/${item.idea.id}`}
                  className={`group block ${
                    isDragging
                      ? 'cursor-grabbing'
                      : connectionMode
                        ? 'cursor-pointer'
                        : 'cursor-grab'
                  }`}
                  onMouseDown={(e) => handleMouseDown(e, item.id)}
                  onClick={(e) => handleNodeClick(e, item.idea.id)}
                  onContextMenu={(e) => handleContextMenu(e, item.idea.id)}
                >
                  <div
                    className={`relative bg-card rounded-lg border border-border shadow-sm p-3 w-48 hover:shadow-md transition-all select-none ${
                      isConnectionSource
                        ? 'border-primary border-2 ring-2 ring-primary/20'
                        : isConnectionTarget
                          ? 'border-primary border-2'
                          : 'border-border hover:border-primary'
                    }`}
                  >
                    {isConnectionSource && (
                      <p className="text-xs text-primary font-medium mb-1">
                        Connecting from...
                      </p>
                    )}
                    {isConnectionTarget && (
                      <p className="text-xs text-primary font-medium mb-1">
                        Click to connect
                      </p>
                    )}
                    <h3 className="font-semibold text-sm mb-1 line-clamp-1 group-hover:text-primary">
                      {item.idea.title}
                    </h3>
                    {item.idea.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {item.idea.description}
                      </p>
                    )}
                  </div>
                </Link>
              </div>
            )
          })}
          </div>
        )}
      </div>
    </div>
  )
}
