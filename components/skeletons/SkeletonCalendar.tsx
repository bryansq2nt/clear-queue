'use client';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton for the calendar tab: filters + day groups + rows.
 */
export function SkeletonCalendar() {
  return (
    <div className="p-4 md:p-6 min-h-full space-y-4" aria-busy="true">
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-md" />
        ))}
      </div>
      <div className="space-y-6">
        {[1, 2, 3].map((day) => (
          <div key={day} className="space-y-2">
            <Skeleton className="h-6 w-32 rounded" />
            <div className="space-y-2 pl-2">
              {[1, 2, 3].map((row) => (
                <Skeleton key={row} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
