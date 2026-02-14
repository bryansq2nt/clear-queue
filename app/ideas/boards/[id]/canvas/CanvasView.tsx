'use client'

import Link from 'next/link'

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

export default function CanvasView({ items }: { items: BoardItem[] }) {
  // World dimensions (large enough for positioning)
  const WORLD_WIDTH = 2000
  const WORLD_HEIGHT = 2000

  return (
    <div className="flex-1 overflow-auto bg-background">
      <div
        className="relative"
        style={{
          width: WORLD_WIDTH,
          height: WORLD_HEIGHT,
          minWidth: WORLD_WIDTH,
          minHeight: WORLD_HEIGHT,
        }}
      >
        {items.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-muted-foreground">
              No ideas on this board yet. Add ideas from the board detail page.
            </p>
          </div>
        ) : (
          items.map((item) => (
            <Link
              key={item.id}
              href={`/ideas/${item.idea.id}`}
              className="absolute group"
              style={{
                left: item.x,
                top: item.y,
                transform: 'translate(0, 0)',
              }}
            >
              <div className="bg-card rounded-lg border border-border shadow-sm p-3 w-48 hover:shadow-md hover:border-primary transition-all cursor-pointer">
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
          ))
        )}
      </div>
    </div>
  )
}
