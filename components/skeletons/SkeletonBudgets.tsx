'use client';

import { Skeleton } from '@/components/ui/skeleton';

const CARD_COUNT = 6;

/**
 * Skeleton for the budgets tab: subtitle + grid of budget cards.
 * Matches ContextBudgetsClient grid (md:grid-cols-2 lg:grid-cols-3 gap-6).
 * Each card: title, description lines, progress bar, stats.
 */
export function SkeletonBudgets() {
  return (
    <div className="p-4 md:p-6 min-h-full" aria-busy="true">
      <Skeleton className="h-4 w-full max-w-md mb-6 rounded" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
        {Array.from({ length: CARD_COUNT }).map((_, i) => (
          <div
            key={i}
            className="bg-card rounded-lg shadow-sm border border-border p-6 flex flex-col space-y-4"
          >
            <Skeleton className="h-5 w-3/4 rounded" />
            <Skeleton className="h-3 w-full rounded" />
            <Skeleton className="h-3 w-2/3 rounded" />
            <Skeleton className="h-2 w-full rounded-full" />
            <div className="flex gap-4 pt-2">
              <Skeleton className="h-4 w-16 rounded" />
              <Skeleton className="h-4 w-20 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
