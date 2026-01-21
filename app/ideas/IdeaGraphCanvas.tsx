'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { updatePositionAction } from './boards/[id]/canvas/actions'
import {
  createConnectionAction,
  deleteConnectionAction,
} from './boards/[id]/canvas/connection-actions'

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

export default function IdeaGraphCanvas({
  boardId,
  items,
  connections,
  onNodeClick,
  onRefresh,
}: {
  boardId: string
  items: BoardItem[]
  connections: Connection[]
  onNodeClick: (ideaId: string) => void
  onRefresh: () => void
}) {
  // World dimensions
  const WORLD_WIDTH = 2000
  const WORLD_HEIGHT = 2000

  // Drag threshold - minimum pixels to move before considering it a drag
  const DRAG_THRESHOLD = 5

  // Card colors - consistent per idea ID
  const CARD_COLORS = [
    { bg: 'bg-red-100', border: 'border-red-300', hover: 'hover:border-red-500', text: 'text-red-900' },
    { bg: 'bg-blue-100', border: 'border-blue-300', hover: 'hover:border-blue-500', text: 'text-blue-900' },
    { bg: 'bg-green-100', border: 'border-green-300', hover: 'hover:border-green-500', text: 'text-green-900' },
    { bg: 'bg-yellow-100', border: 'border-yellow-300', hover: 'hover:border-yellow-500', text: 'text-yellow-900' },
    { bg: 'bg-purple-100', border: 'border-purple-300', hover: 'hover:border-purple-500', text: 'text-purple-900' },
    { bg: 'bg-pink-100', border: 'border-pink-300', hover: 'hover:border-pink-500', text: 'text-pink-900' },
    { bg: 'bg-indigo-100', border: 'border-indigo-300', hover: 'hover:border-indigo-500', text: 'text-indigo-900' },
    { bg: 'bg-orange-100', border: 'border-orange-300', hover: 'hover:border-orange-500', text: 'text-orange-900' },
    { bg: 'bg-teal-100', border: 'border-teal-300', hover: 'hover:border-teal-500', text: 'text-teal-900' },
    { bg: 'bg-cyan-100', border: 'border-cyan-300', hover: 'hover:border-cyan-500', text: 'text-cyan-900' },
    { bg: 'bg-lime-100', border: 'border-lime-300', hover: 'hover:border-lime-500', text: 'text-lime-900' },
    { bg: 'bg-emerald-100', border: 'border-emerald-300', hover: 'hover:border-emerald-500', text: 'text-emerald-900' },
    { bg: 'bg-rose-100', border: 'border-rose-300', hover: 'hover:border-rose-500', text: 'text-rose-900' },
    { bg: 'bg-violet-100', border: 'border-violet-300', hover: 'hover:border-violet-500', text: 'text-violet-900' },
    { bg: 'bg-fuchsia-100', border: 'border-fuchsia-300', hover: 'hover:border-fuchsia-500', text: 'text-fuchsia-900' },
  ]

  // Drag state
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null)
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(
    new Map(items.map((item) => [item.id, { x: item.x, y: item.y }]))
  )
  const [isSaving, setIsSaving] = useState<string | null>(null)
  const [hasDragged, setHasDragged] = useState(false)
  const [connectionMode, setConnectionMode] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const router = useRouter()

  // Get color for idea based on ID (consistent)
  const getColorForIdea = useCallback((ideaId: string) => {
    let hash = 0
    for (let i = 0; i < ideaId.length; i++) {
      hash = ideaId.charCodeAt(i) + ((hash << 5) - hash)
    }
    const index = Math.abs(hash) % CARD_COLORS.length
    return CARD_COLORS[index]
  }, [])

  // Sync positions when items change
  useEffect(() => {
    setPositions(new Map(items.map((item) => [item.id, { x: item.x, y: item.y }])))
  }, [items])

  // Get current position for an item
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

  // Get card center for connections (dynamic based on actual card size)
  const getCardCenter = useCallback(
    (ideaId: string) => {
      const itemId = ideaToItemMap.get(ideaId)
      if (!itemId) return null

      const pos = getPosition(itemId)
      const cardElement = cardRefs.current.get(itemId)

      if (!cardElement) {
        // Fallback si no hay ref todavía (usar tamaño aproximado)
        return { x: pos.x + 50, y: pos.y + 20 }
      }

      const rect = cardElement.getBoundingClientRect()
      const containerRect = containerRef.current?.getBoundingClientRect()
      if (!containerRect) return { x: pos.x + 50, y: pos.y + 20 }

      // Calcular posición relativa al contenedor
      return {
        x: pos.x + rect.width / 2,
        y: pos.y + rect.height / 2,
      }
    },
    [ideaToItemMap, getPosition]
  )

  // Handle context menu (right click) to start connection
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, ideaId: string) => {
      e.preventDefault()
      e.stopPropagation()

      if (connectionMode === ideaId) {
        setConnectionMode(null)
      } else {
        setConnectionMode(ideaId)
      }
    },
    [connectionMode]
  )

  // Handle click on node
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
          onRefresh()
        }

        setConnectionMode(null)
        return
      }

      // CRÍTICO: Solo abrir drawer si NO se hizo drag
      if (hasDragged) {
        e.preventDefault()
        e.stopPropagation()
        return
      }

      // Otherwise, open drawer
      onNodeClick(ideaId)
    },
    [connectionMode, hasDragged, onNodeClick, onRefresh]
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

      // Guardar posición inicial del mouse para calcular threshold
      setDragStartPos({ x: e.clientX, y: e.clientY })

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
        onRefresh()
      }
    },
    [onRefresh]
  )

  // Handle mouse move
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!draggingNodeId || !containerRef.current) return

      // Calcular distancia desde el inicio para determinar si es drag
      if (dragStartPos) {
        const distance = Math.sqrt(
          Math.pow(e.clientX - dragStartPos.x, 2) +
          Math.pow(e.clientY - dragStartPos.y, 2)
        )

        // Solo marcar como dragged si superamos el threshold
        if (distance > DRAG_THRESHOLD) {
          setHasDragged(true)
        }
      }

      // Usar requestAnimationFrame para smooth animation
      requestAnimationFrame(() => {
        if (!containerRef.current || !draggingNodeId) return

        const containerRect = containerRef.current.getBoundingClientRect()
        const newX = e.clientX - containerRect.left - dragOffset.x
        const newY = e.clientY - containerRect.top - dragOffset.y

        // Update position optimistically
        setPositions((prev) => {
          const next = new Map(prev)
          next.set(draggingNodeId, { x: newX, y: newY })
          return next
        })
      })
    },
    [draggingNodeId, dragOffset, dragStartPos]
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
      setDragStartPos(null) // Limpiar posición inicial

      // Si hicimos drag, guardar posición y prevenir click
      if (wasDragging) {
        e.preventDefault()
        setIsSaving(itemIdToSave)

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
        } else {
          onRefresh()
        }
      }

      // Resetear hasDragged después de un pequeño delay para prevenir clicks
      setTimeout(() => setHasDragged(false), 100)
    },
    [draggingNodeId, hasDragged, getPosition, items, onRefresh]
  )

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
      className="flex-1 overflow-auto bg-slate-50"
      ref={containerRef}
      onClick={(e) => {
        // Cancel connection mode if clicking on canvas
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
        {/* SVG for connections - rendered behind nodes */}
        <svg
          className="absolute top-0 left-0"
          style={{
            width: WORLD_WIDTH,
            height: WORLD_HEIGHT,
            zIndex: 0,
          }}
        >
          {connections.map((conn) => {
            const fromCenter = getCardCenter(conn.from_idea_id)
            const toCenter = getCardCenter(conn.to_idea_id)

            if (!fromCenter || !toCenter) return null

            return (
              <line
                key={conn.id}
                x1={fromCenter.x}
                y1={fromCenter.y}
                x2={toCenter.x}
                y2={toCenter.y}
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

        {/* Nodes - rendered on top */}
        {items.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-muted-foreground">
              No hay palabras en este board aún. Click "Agregar Palabra" para agregar una.
            </p>
          </div>
        ) : (
          items.map((item) => {
            const pos = getPosition(item.id)
            const isDragging = draggingNodeId === item.id
            const isSavingThis = isSaving === item.id
            const isConnectionSource = connectionMode === item.idea.id
            const isConnectionTarget =
              connectionMode && connectionMode !== item.idea.id
            const cardColor = getColorForIdea(item.idea.id)

            return (
              <div
                key={item.id}
                className="absolute"
                style={{
                  left: 0,
                  top: 0,
                  transform: `translate(${pos.x}px, ${pos.y}px)`,
                  zIndex: isDragging ? 50 : 10,
                  opacity: isSavingThis ? 0.7 : 1,
                  willChange: isDragging ? 'transform' : 'auto',
                  transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                }}
              >
                <div
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
                    ref={(el) => {
                      if (el) {
                        cardRefs.current.set(item.id, el)
                      } else {
                        cardRefs.current.delete(item.id)
                      }
                    }}
                    className={`
                      rounded-lg border-2 shadow-sm transition-all select-none
                      px-4 py-2 
                      inline-block
                      min-w-fit
                      ${cardColor.bg} 
                      ${cardColor.border} 
                      ${cardColor.hover}
                      ${isConnectionSource
                        ? 'border-primary ring-2 ring-primary/20'
                        : isConnectionTarget
                          ? 'border-primary'
                          : ''
                      }
                      hover:shadow-md
                    `}
                    title={item.idea.description || ''}
                  >
                    {isConnectionSource && (
                      <p className="text-xs text-primary font-medium mb-1 whitespace-nowrap">
                        Connecting from...
                      </p>
                    )}
                    {isConnectionTarget && (
                      <p className="text-xs text-primary font-medium mb-1 whitespace-nowrap">
                        Click to connect
                      </p>
                    )}
                    <h3 className={`font-semibold text-sm whitespace-nowrap ${cardColor.text}`}>
                      {item.idea.title}
                    </h3>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
