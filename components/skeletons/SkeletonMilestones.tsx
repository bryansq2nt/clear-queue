'use client';

import { Skeleton } from '@/components/ui/skeleton';

/** Shimmer skeleton for the milestones tab (list + timeline layout). */
export function SkeletonMilestones() {
  return (
    <div className="p-4 md:p-6 min-h-full space-y-6" aria-busy="true">
      <div className="flex justify-between items-center">
        <Skeleton className="h-8 w-48 rounded" />
        <Skeleton className="h-9 w-32 rounded" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-lg border border-border p-4"
          >
            <Skeleton className="h-10 w-10 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-3/4 rounded" />
              <Skeleton className="h-3 w-1/2 rounded" />
            </div>
            <Skeleton className="h-8 w-20 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
