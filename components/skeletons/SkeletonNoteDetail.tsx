'use client';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton for note detail view: title + content area + links sidebar.
 * Matches NoteEditor layout (max-w-4xl/6xl, title input, content, links section).
 */
export function SkeletonNoteDetail() {
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto" aria-busy="true">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 lg:gap-10 pt-6">
        <div className="min-w-0 space-y-6">
          <Skeleton className="h-9 w-full max-w-xl rounded" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <Skeleton
                key={i}
                className="h-4 w-full rounded"
                style={{
                  width: i % 3 === 0 ? '95%' : i % 3 === 1 ? '88%' : '100%',
                }}
              />
            ))}
          </div>
        </div>
        <div className="lg:pl-4 lg:border-l border-border">
          <Skeleton className="h-5 w-32 mb-4 rounded" />
          <div className="space-y-2">
            <Skeleton className="h-10 w-full rounded" />
            <Skeleton className="h-10 w-[85%] rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}
