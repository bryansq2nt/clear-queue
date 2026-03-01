'use client';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton for the calendar tab: filters + month grid.
 */
export function SkeletonCalendar() {
  return (
    <div className="p-4 md:p-6 min-h-full space-y-4" aria-busy="true">
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-md" />
        ))}
      </div>
      <div className="rounded-lg border border-border bg-card p-2">
        <div className="flex items-center justify-between px-1 py-2">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-5 w-32 rounded" />
          <Skeleton className="h-8 w-8 rounded" />
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: 7 * 6 }, (_, i) => (
            <Skeleton key={i} className="aspect-square rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}
