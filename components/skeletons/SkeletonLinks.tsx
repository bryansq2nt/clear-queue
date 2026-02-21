'use client';

import { Skeleton } from '@/components/ui/skeleton';

const ROW_COUNT = 5;

/**
 * Shimmer skeleton for the Links tab. No spinners or "Loading..." text.
 * Matches a list of link rows (title + url line).
 */
export function SkeletonLinks() {
  return (
    <div className="p-4 md:p-6 min-h-full" aria-busy="true">
      <div className="space-y-3">
        {Array.from({ length: ROW_COUNT }).map((_, i) => (
          <div
            key={i}
            className="bg-card rounded-lg border border-border p-4 flex items-center gap-3"
          >
            <Skeleton className="h-5 w-[60%] rounded" />
            <Skeleton className="h-3 w-[35%] rounded flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
