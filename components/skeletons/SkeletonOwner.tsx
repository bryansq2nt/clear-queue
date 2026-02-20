'use client';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton for the project owner tab: title + two cards (client, business).
 * Matches ContextOwnerClient layout (header + body lines per card).
 */
export function SkeletonOwner() {
  return (
    <div className="p-4 md:p-6 max-w-2xl" aria-busy="true">
      <Skeleton className="h-6 w-48 mb-4 rounded" />
      <div className="space-y-6">
        {/* Client card */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Skeleton className="h-5 w-5 rounded-full flex-shrink-0" />
              <Skeleton className="h-5 w-36 rounded" />
            </div>
            <Skeleton className="h-4 w-24 rounded flex-shrink-0" />
          </div>
          <div className="p-4 space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-4 w-16 shrink-0 rounded" />
                <Skeleton className="h-4 flex-1 max-w-[200px] rounded" />
              </div>
            ))}
          </div>
        </div>
        {/* Business card */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Skeleton className="h-5 w-5 rounded-full flex-shrink-0" />
              <Skeleton className="h-5 w-40 rounded" />
            </div>
            <Skeleton className="h-4 w-24 rounded flex-shrink-0" />
          </div>
          <div className="p-4 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-4 w-16 shrink-0 rounded" />
                <Skeleton className="h-4 flex-1 max-w-[180px] rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
