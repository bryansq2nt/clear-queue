'use client';

import { Skeleton } from '@/components/ui/skeleton';

const CARD_COUNT = 8;

/**
 * Skeleton for the ideas tab: title + grid of board cards (icon + title + 2 lines).
 * Matches ContextIdeasClient grid (sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4).
 */
export function SkeletonIdeas() {
  return (
    <div className="p-4 md:p-6 flex-1 overflow-auto" aria-busy="true">
      <Skeleton className="h-6 w-52 mb-4 rounded" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: CARD_COUNT }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-border bg-card p-4 flex flex-col min-h-[120px] space-y-2"
          >
            <div className="flex items-start gap-2">
              <Skeleton className="h-5 w-5 rounded flex-shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4 rounded" />
                <Skeleton className="h-3 w-full rounded" />
                <Skeleton className="h-3 w-2/3 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
