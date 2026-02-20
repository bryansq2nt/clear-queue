'use client';

import { Skeleton } from '@/components/ui/skeleton';

const ROW_COUNT = 6;

/**
 * Skeleton for the todos tab: title + add form + list of task rows.
 * Matches ContextTodosClient layout (max-w-3xl, form, divide-y list).
 */
export function SkeletonTodos() {
  return (
    <div className="p-4 md:p-6 max-w-3xl" aria-busy="true">
      <Skeleton className="h-6 w-40 mb-4 rounded" />
      <div className="flex gap-2 items-center mb-6">
        <Skeleton className="h-10 flex-1 rounded-lg" />
        <Skeleton className="h-10 w-24 rounded-lg" />
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: ROW_COUNT }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-3">
            <Skeleton className="h-5 w-5 rounded-full flex-shrink-0" />
            <Skeleton
              className={`h-4 rounded flex-1 ${
                i % 3 === 0 ? 'max-w-[90%]' : i % 3 === 1 ? 'max-w-[75%]' : 'max-w-[60%]'
              }`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
