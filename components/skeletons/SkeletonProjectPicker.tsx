'use client';

import { Skeleton } from '@/components/ui/skeleton';

const CARD_COUNT = 6;

/**
 * Skeleton for the home / project picker: header, subtitle, grid of project cards.
 * Matches ContextProjectPicker layout so the swap to real content doesn't jump.
 */
export function SkeletonProjectPicker() {
  return (
    <div className="min-h-screen flex flex-col bg-background" aria-busy="true">
      <header className="bg-primary text-primary-foreground shadow flex-shrink-0">
        <div className="px-4 md:px-6 py-3 md:py-4 flex items-center justify-center min-w-0">
          <Skeleton className="h-6 w-48 bg-primary-foreground/20 rounded" />
        </div>
      </header>
      <main className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="max-w-md mx-auto mb-6">
          <Skeleton className="h-4 w-full max-w-sm mx-auto rounded" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl mx-auto">
          {Array.from({ length: CARD_COUNT }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-card p-5 space-y-2"
            >
              <Skeleton className="h-5 w-[85%] rounded" />
              <Skeleton className="h-4 w-2/3 rounded" />
              <Skeleton className="h-3 w-20 rounded" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
