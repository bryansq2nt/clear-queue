'use client';

import { Skeleton } from '@/components/ui/skeleton';

const STATUS_COUNT = 5;
const CARDS_PER_COLUMN = 3;
const MOBILE_CARDS = 4;

/**
 * Skeleton for the context board (Etapas): mimics Kanban layout so the swap to real content doesn't jump.
 * Shimmer gives the "already working" feel while data loads.
 */
export function SkeletonBoard() {
  return (
    <div className="flex flex-col p-4 md:p-6 min-h-full">
      {/* Mobile: chips + one column */}
      <div className="flex flex-col flex-1 min-h-0 lg:hidden">
        <div className="flex flex-wrap gap-2 mb-4">
          {Array.from({ length: STATUS_COUNT }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24 rounded-full flex-shrink-0" />
          ))}
        </div>
        <div className="flex flex-col flex-1 min-h-0 gap-3">
          <Skeleton className="rounded-xl min-h-[200px] flex-1" />
          {Array.from({ length: MOBILE_CARDS }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg w-full" />
          ))}
          <Skeleton className="h-12 w-full rounded-lg border-2 border-dashed mt-2" />
        </div>
      </div>

      {/* Desktop: 5 columns with card skeletons */}
      <div className="hidden lg:flex lg:flex-row lg:gap-4 lg:flex-1 lg:min-h-0 lg:overflow-x-auto lg:pb-2 lg:pr-2">
        {Array.from({ length: STATUS_COUNT }).map((_, colIndex) => (
          <div
            key={colIndex}
            className="flex flex-col flex-shrink-0 min-w-[280px] rounded-xl overflow-hidden border border-border bg-card/50"
          >
            <div className="p-3 border-b border-border">
              <Skeleton className="h-5 w-28 mb-1" />
              <Skeleton className="h-4 w-16" />
            </div>
            <div className="p-3 space-y-3 flex-1 min-h-[200px]">
              {Array.from({ length: CARDS_PER_COLUMN }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-lg w-full" />
              ))}
            </div>
            <div className="p-3 border-t border-border">
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
