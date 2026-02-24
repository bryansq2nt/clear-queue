'use client';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * Single shimmer row matching the real DocumentRow dimensions.
 * Used by SkeletonDocuments.
 */
export function SkeletonDocumentRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 min-h-[56px]">
      {/* File type icon placeholder */}
      <Skeleton className="h-8 w-8 rounded flex-shrink-0" />
      {/* Title + category */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton className="h-4 w-[55%] rounded" />
        <Skeleton className="h-3 w-20 rounded" />
      </div>
      {/* Size + date */}
      <div className="hidden sm:flex flex-col items-end gap-1.5 flex-shrink-0">
        <Skeleton className="h-3 w-12 rounded" />
        <Skeleton className="h-3 w-16 rounded" />
      </div>
      {/* Actions placeholder */}
      <Skeleton className="h-7 w-7 rounded flex-shrink-0" />
    </div>
  );
}
