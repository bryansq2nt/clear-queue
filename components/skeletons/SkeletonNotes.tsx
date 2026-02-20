'use client';

import { Skeleton } from '@/components/ui/skeleton';

const CARD_COUNT = 6;

/**
 * Skeleton for the notes tab: grid of note cards (title + date line).
 * Matches ContextNotesClient grid (sm:grid-cols-2 lg:grid-cols-3).
 */
export function SkeletonNotes() {
  return (
    <div className="p-4 md:p-6 min-h-full" aria-busy="true">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: CARD_COUNT }).map((_, i) => (
          <div
            key={i}
            className="bg-card rounded-lg border border-border p-5 space-y-2"
          >
            <Skeleton className="h-5 w-[85%] rounded" />
            <Skeleton className="h-3 w-20 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
