'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { useRouter } from 'next/navigation';
import { batchUpdatePositionsAction } from './boards/[id]/canvas/batch-actions';
import {
  createConnectionAction,
  deleteConnectionAction,
} from './boards/[id]/canvas/connection-actions';

interface Idea {
  id: string;
  title: string;
  description: string | null;
}

interface BoardItem {
  id: string;
  idea_id: string;
  x: number;
  y: number;
  idea: Idea;
}

interface Connection {
  id: string;
  from_idea_id: string;
  to_idea_id: string;
  type: string;
}

// ⚡ Threshold para detectar drag vs click
const DRAG_THRESHOLD = 5;

// ⚡ Colores para cards (theme-aware: light pastels, dark opacity tints)
const CARD_COLORS = [
  {
    bg: 'bg-red-500/20',
    border: 'border-red-500/50',
    hover: 'hover:border-red-500',
    text: 'text-red-700 dark:text-red-400',
  },
  {
    bg: 'bg-blue-500/20',
    border: 'border-blue-500/50',
    hover: 'hover:border-blue-500',
    text: 'text-blue-700 dark:text-blue-400',
  },
  {
    bg: 'bg-green-500/20',
    border: 'border-green-500/50',
    hover: 'hover:border-green-500',
    text: 'text-green-700 dark:text-green-400',
  },
  {
    bg: 'bg-yellow-500/20',
    border: 'border-yellow-500/50',
    hover: 'hover:border-yellow-500',
    text: 'text-yellow-700 dark:text-yellow-400',
  },
  {
    bg: 'bg-purple-500/20',
    border: 'border-purple-500/50',
    hover: 'hover:border-purple-500',
    text: 'text-purple-700 dark:text-purple-400',
  },
  {
    bg: 'bg-pink-500/20',
    border: 'border-pink-500/50',
    hover: 'hover:border-pink-500',
    text: 'text-pink-700 dark:text-pink-400',
  },
  {
    bg: 'bg-indigo-500/20',
    border: 'border-indigo-500/50',
    hover: 'hover:border-indigo-500',
    text: 'text-indigo-700 dark:text-indigo-400',
  },
  {
    bg: 'bg-orange-500/20',
    border: 'border-orange-500/50',
    hover: 'hover:border-orange-500',
    text: 'text-orange-700 dark:text-orange-400',
  },
  {
    bg: 'bg-teal-500/20',
    border: 'border-teal-500/50',
    hover: 'hover:border-teal-500',
    text: 'text-teal-700 dark:text-teal-400',
  },
  {
    bg: 'bg-cyan-500/20',
    border: 'border-cyan-500/50',
    hover: 'hover:border-cyan-500',
    text: 'text-cyan-700 dark:text-cyan-400',
  },
  {
    bg: 'bg-lime-500/20',
    border: 'border-lime-500/50',
    hover: 'hover:border-lime-500',
    text: 'text-lime-700 dark:text-lime-400',
  },
  {
    bg: 'bg-emerald-500/20',
    border: 'border-emerald-500/50',
    hover: 'hover:border-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-400',
  },
  {
    bg: 'bg-rose-500/20',
    border: 'border-rose-500/50',
    hover: 'hover:border-rose-500',
    text: 'text-rose-700 dark:text-rose-400',
  },
  {
    bg: 'bg-violet-500/20',
    border: 'border-violet-500/50',
    hover: 'hover:border-violet-500',
    text: 'text-violet-700 dark:text-violet-400',
  },
  {
    bg: 'bg-fuchsia-500/20',
    border: 'border-fuchsia-500/50',
    hover: 'hover:border-fuchsia-500',
    text: 'text-fuchsia-700 dark:text-fuchsia-400',
  },
];

export default function IdeaGraphCanvas({
  boardId,
  items,
  connections,
  onNodeClick,
  onRefresh,
}: {
  boardId: string;
  items: BoardItem[];
  connections: Connection[];
  onNodeClick: (ideaId: string) => void;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();

  // World dimensions
  const WORLD_WIDTH = 2000;
  const WORLD_HEIGHT = 2000;
  // SVG padding to allow connections to render outside original bounds
  const SVG_PADDING = 2000;
  const SVG_TOTAL_WIDTH = WORLD_WIDTH + SVG_PADDING * 2;
  const SVG_TOTAL_HEIGHT = WORLD_HEIGHT + SVG_PADDING * 2;

  // ⚡ Estado optimista - se actualiza INMEDIATAMENTE sin esperar backend
  const [positions, setPositions] = useState<
    Map<string, { x: number; y: number }>
  >(new Map(items.map((item) => [item.id, { x: item.x, y: item.y }])));

  // Drag state
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragStartPos, setDragStartPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [hasDragged, setHasDragged] = useState(false);
  const [connectionMode, setConnectionMode] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(
    null
  );
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pendingUpdates = useRef<Map<string, { x: number; y: number }>>(
    new Map()
  );
  const batchTimer = useRef<NodeJS.Timeout | null>(null);

  // ⚡ Función para asignar color consistente
  const getColorForIdea = useCallback((ideaId: string) => {
    let hash = 0;
    for (let i = 0; i < ideaId.length; i++) {
      hash = ideaId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % CARD_COLORS.length;
    return CARD_COLORS[index];
  }, []);

  // Sync positions when items change from server
  useEffect(() => {
    setPositions(
      new Map(items.map((item) => [item.id, { x: item.x, y: item.y }]))
    );
  }, [items]);

  // ⚡ CRÍTICO: Función de guardado con batch
  const savePositionBatched = useCallback(
    (itemId: string, x: number, y: number) => {
      // Agregar a pending updates
      pendingUpdates.current.set(itemId, { x, y });

      // Cancelar timer anterior
      if (batchTimer.current) {
        clearTimeout(batchTimer.current);
      }

      // Crear nuevo timer que ejecuta batch save
      batchTimer.current = setTimeout(async () => {
        const updates = Array.from(pendingUpdates.current.entries()).map(
          ([id, pos]) => ({ id, x: pos.x, y: pos.y })
        );

        if (updates.length === 0) return;

        console.log(`💾 Batch saving ${updates.length} positions...`);

        try {
          const result = await batchUpdatePositionsAction(updates);

          if (result.error) {
            console.error('Batch save failed:', result.error);
            // Revertir posiciones en caso de error
            updates.forEach((update) => {
              const originalItem = items.find((i) => i.id === update.id);
              if (originalItem) {
                setPositions((prev) => {
                  const next = new Map(prev);
                  next.set(update.id, { x: originalItem.x, y: originalItem.y });
                  return next;
                });
              }
            });
          } else {
            console.log(`✅ Batch saved ${result.succeeded} positions`);
            pendingUpdates.current.clear();
          }
        } catch (error) {
          console.error('Batch save error:', error);
        }
      }, 1000); // 1 segundo después del último movimiento
    },
    [items]
  );

  // Get current position for an item
  const getPosition = useCallback(
    (itemId: string) => {
      const pos = positions.get(itemId);
      if (pos) return pos;
      const item = items.find((i) => i.id === itemId);
      return item ? { x: item.x, y: item.y } : { x: 0, y: 0 };
    },
    [positions, items]
  );

  // Create a map: ideaId -> boardItemId
  const ideaToItemMap = useMemo(
    () => new Map(items.map((item) => [item.idea_id, item.id])),
    [items]
  );

  // Get card center for connections
  const getCardCenter = useCallback(
    (ideaId: string) => {
      const itemId = ideaToItemMap.get(ideaId);
      if (!itemId) return null;

      const pos = getPosition(itemId);
      const cardElement = cardRefs.current.get(itemId);

      if (!cardElement) {
        // Add SVG padding offset to coordinates
        return { x: pos.x + SVG_PADDING + 50, y: pos.y + SVG_PADDING + 20 };
      }

      const rect = cardElement.getBoundingClientRect();
      const containerRect = containerRef.current?.getBoundingClientRect();

      if (!containerRect) {
        // Add SVG padding offset to coordinates
        return { x: pos.x + SVG_PADDING + 50, y: pos.y + SVG_PADDING + 20 };
      }

      // Add SVG padding offset to coordinates so lines render in expanded SVG area
      return {
        x: pos.x + SVG_PADDING + rect.width / (2 * view.scale),
        y: pos.y + SVG_PADDING + rect.height / (2 * view.scale),
      };
    },
    [ideaToItemMap, getPosition, view.scale]
  );

  // Handle context menu (right click) to start connection
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, ideaId: string) => {
      e.preventDefault();
      e.stopPropagation();

      if (connectionMode === ideaId) {
        setConnectionMode(null);
      } else {
        setConnectionMode(ideaId);
      }
    },
    [connectionMode]
  );

  // Handle click on node
  const handleNodeClick = useCallback(
    async (e: React.MouseEvent, ideaId: string) => {
      // If in connection mode, create connection
      if (connectionMode && connectionMode !== ideaId) {
        e.preventDefault();
        e.stopPropagation();

        const result = await createConnectionAction(connectionMode, ideaId);

        if (result.error) {
          alert(`Failed to create connection: ${result.error}`);
        } else {
          onRefresh();
        }

        setConnectionMode(null);
        return;
      }

      // ⚡ CRÍTICO: Solo abrir drawer si NO hicimos drag
      if (hasDragged) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Otherwise, open drawer
      onNodeClick(ideaId);
    },
    [connectionMode, hasDragged, onNodeClick, onRefresh]
  );

  // Handle mouse down on a node
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, itemId: string) => {
      // Don't start drag if in connection mode
      if (connectionMode) return;

      e.preventDefault();
      e.stopPropagation();

      // ⚡ Guardar posición inicial del mouse
      setDragStartPos({ x: e.clientX, y: e.clientY });

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const offsetX = (e.clientX - rect.left) / view.scale;
      const offsetY = (e.clientY - rect.top) / view.scale;

      setDragOffset({ x: offsetX, y: offsetY });
      setDraggingNodeId(itemId);
      setHasDragged(false);
    },
    [connectionMode, view.scale]
  );

  // Handle click on connection line to delete
  const handleConnectionClick = useCallback(
    async (e: React.MouseEvent, connectionId: string) => {
      e.preventDefault();
      e.stopPropagation();

      if (!confirm('Are you sure you want to delete this connection?')) {
        return;
      }

      const result = await deleteConnectionAction(connectionId);

      if (result.error) {
        alert(`Failed to delete connection: ${result.error}`);
      } else {
        onRefresh();
      }
    },
    [onRefresh]
  );

  // ⚡ CRÍTICO: Mouse move - SOLO actualiza UI con requestAnimationFrame
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!draggingNodeId || !containerRef.current) return;

      // Calcular distancia desde el inicio para determinar si es drag
      if (dragStartPos) {
        const distance = Math.sqrt(
          Math.pow(e.clientX - dragStartPos.x, 2) +
            Math.pow(e.clientY - dragStartPos.y, 2)
        );

        // Solo marcar como drag si superamos el threshold
        if (distance > DRAG_THRESHOLD) {
          setHasDragged(true);
        }
      }

      // ⚡ OPTIMISTIC UPDATE - requestAnimationFrame para smooth rendering
      requestAnimationFrame(() => {
        if (!containerRef.current) return;
        const containerRect = containerRef.current.getBoundingClientRect();
        const newX =
          (e.clientX - containerRect.left - view.x) / view.scale - dragOffset.x;
        const newY =
          (e.clientY - containerRect.top - view.y) / view.scale - dragOffset.y;

        // Actualizar posición INMEDIATAMENTE en la UI
        setPositions((prev) => {
          const next = new Map(prev);
          next.set(draggingNodeId, { x: newX, y: newY });
          return next;
        });
      });
    },
    [draggingNodeId, dragOffset, dragStartPos, view.scale, view.x, view.y]
  );

  // ⚡ CRÍTICO: Mouse up - trigger debounced save
  const handleMouseUp = useCallback(() => {
    if (!draggingNodeId) return;

    const itemIdToSave = draggingNodeId;
    const finalPos = getPosition(itemIdToSave);

    // Reset drag state INMEDIATAMENTE - no esperar backend
    setDraggingNodeId(null);
    setDragStartPos(null);

    // Si hicimos drag, guardar con batch (en background)
    if (hasDragged) {
      savePositionBatched(itemIdToSave, finalPos.x, finalPos.y);
    }

    // Reset hasDragged después de un delay
    setTimeout(() => setHasDragged(false), 50);
  }, [draggingNodeId, hasDragged, getPosition, savePositionBatched]);

  // Set up global mouse event listeners for drag
  useEffect(() => {
    if (!draggingNodeId) return;

    const handleMove = (e: MouseEvent) => handleMouseMove(e);
    const handleUp = () => handleMouseUp();

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [draggingNodeId, handleMouseMove, handleMouseUp]);

  // Handle ESC to cancel connection mode
  useEffect(() => {
    if (!connectionMode) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setConnectionMode(null);
      }
    };

    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [connectionMode]);

  useEffect(() => {
    if (!isPanning) return;

    const handleMove = (e: MouseEvent) => {
      if (!panStart) return;
      const deltaX = e.clientX - panStart.x;
      const deltaY = e.clientY - panStart.y;
      setView((prev) => ({
        ...prev,
        x: prev.x + deltaX,
        y: prev.y + deltaY,
      }));
      setPanStart({ x: e.clientX, y: e.clientY });
    };

    const handleUp = () => {
      setIsPanning(false);
      setPanStart(null);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isPanning, panStart]);

  useEffect(() => {
    const timer = batchTimer.current;
    const updates = pendingUpdates.current;

    return () => {
      // Limpiar batch timer
      if (timer) {
        clearTimeout(timer);
      }

      // Ejecutar save final si hay cambios pendientes
      if (updates.size > 0) {
        const updateArray = Array.from(updates.entries()).map(([id, pos]) => ({
          id,
          x: pos.x,
          y: pos.y,
        }));
        batchUpdatePositionsAction(updateArray);
        updates.clear();
      }
    };
  }, []);

  return (
    <div
      className="flex-1 overflow-hidden bg-background"
      ref={containerRef}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        if (draggingNodeId || connectionMode) return;
        const target = e.target as HTMLElement;
        if (target.closest('[data-idea-card="true"]')) return;
        setIsPanning(true);
        setPanStart({ x: e.clientX, y: e.clientY });
      }}
      onWheel={(e) => {
        if (!containerRef.current) return;
        e.preventDefault();
        const rect = containerRef.current.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;
        const zoomIntensity = 0.0015;
        const nextScale = Math.min(
          2.5,
          Math.max(0.4, view.scale * (1 - e.deltaY * zoomIntensity))
        );
        const worldX = (cursorX - view.x) / view.scale;
        const worldY = (cursorY - view.y) / view.scale;
        const nextX = cursorX - worldX * nextScale;
        const nextY = cursorY - worldY * nextScale;
        setView({ x: nextX, y: nextY, scale: nextScale });
      }}
      onClick={(e) => {
        if (
          connectionMode &&
          (e.target === containerRef.current || e.target === worldRef.current)
        ) {
          setConnectionMode(null);
        }
      }}
    >
      {/* Connection mode indicator */}
      {connectionMode && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 bg-primary text-primary-foreground px-4 py-2 rounded-md shadow-lg">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">
              {t('ideas.connection_mode')}
            </span>
            <button
              onClick={() => setConnectionMode(null)}
              className="text-sm underline hover:no-underline"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      <div
        ref={worldRef}
        className="relative"
        style={{
          width: WORLD_WIDTH,
          height: WORLD_HEIGHT,
          minWidth: WORLD_WIDTH,
          minHeight: WORLD_HEIGHT,
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          transformOrigin: '0 0',
        }}
      >
        {/* Layer 1: Connections - must render behind nodes */}
        <div className="absolute inset-0 z-0 pointer-events-none [&_line]:pointer-events-auto">
          <svg
            className="absolute top-0 left-0"
            style={{
              width: SVG_TOTAL_WIDTH,
              height: SVG_TOTAL_HEIGHT,
              left: -SVG_PADDING,
              top: -SVG_PADDING,
            }}
          >
            {connections.map((conn) => {
              const fromPos = getCardCenter(conn.from_idea_id);
              const toPos = getCardCenter(conn.to_idea_id);

              if (!fromPos || !toPos) return null;

              return (
                <line
                  key={conn.id}
                  x1={fromPos.x}
                  y1={fromPos.y}
                  x2={toPos.x}
                  y2={toPos.y}
                  stroke="#94a3b8"
                  strokeWidth={4}
                  strokeDasharray={conn.type === 'relates_to' ? '0' : '5,5'}
                  className="pointer-events-auto cursor-pointer hover:stroke-slate-600 transition-colors"
                  onClick={(e) => {
                    const mouseEvent = e as any;
                    handleConnectionClick(mouseEvent, conn.id);
                  }}
                />
              );
            })}
          </svg>
        </div>

        {/* Layer 2: Nodes - always on top; pointer-events-none so clicks pass through to lines */}
        <div className="absolute inset-0 z-[100] pointer-events-none">
          {items.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-muted-foreground">
                No ideas on this board yet. Click &apos;Agregar Palabra&apos; to
                add one.
              </p>
            </div>
          ) : (
            items.map((item) => {
              const pos = getPosition(item.id);
              const isDragging = draggingNodeId === item.id;
              const isConnectionSource = connectionMode === item.idea.id;
              const isConnectionTarget =
                connectionMode && connectionMode !== item.idea.id;
              const cardColor = getColorForIdea(item.idea.id);

              return (
                <div
                  key={item.id}
                  className="absolute pointer-events-auto"
                  style={{
                    left: 0,
                    top: 0,
                    transform: `translate(${pos.x}px, ${pos.y}px)`,
                    zIndex: isDragging ? 200 : 100,
                    willChange: isDragging ? 'transform' : 'auto',
                    transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                  }}
                >
                  <div
                    ref={(el) => {
                      if (el) {
                        cardRefs.current.set(item.id, el);
                      }
                    }}
                    data-idea-card="true"
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
                      className={`
                      relative rounded-lg border-2 shadow-sm transition-all select-none
                      px-4 py-2 inline-block min-w-fit
                      bg-card
                      ${cardColor.border} 
                      ${cardColor.hover}
                      ${
                        isConnectionSource
                          ? 'border-primary ring-2 ring-primary/20'
                          : isConnectionTarget
                            ? 'border-primary'
                            : ''
                      }
                      hover:shadow-md
                    `}
                    >
                      {isConnectionSource && (
                        <p className="text-xs text-primary font-medium mb-1 whitespace-nowrap">
                          {t('ideas.connecting_from')}
                        </p>
                      )}
                      {isConnectionTarget && (
                        <p className="text-xs text-primary font-medium mb-1 whitespace-nowrap">
                          {t('ideas.click_to_connect')}
                        </p>
                      )}
                      <h3
                        className={`font-semibold text-sm whitespace-nowrap ${cardColor.text}`}
                      >
                        {item.idea.title}
                      </h3>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
