'use client';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton for the Copilot tab: mimics a chat panel with message bubbles
 * and a fixed input bar at the bottom.
 */
export function SkeletonCopilot() {
  return (
    <div className="flex flex-col h-full" aria-busy="true">
      {/* Message list area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {/* Assistant message */}
        <div className="flex gap-3 max-w-2xl">
          <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-[90%] rounded" />
            <Skeleton className="h-4 w-[75%] rounded" />
            <Skeleton className="h-4 w-[55%] rounded" />
          </div>
        </div>
        {/* User message */}
        <div className="flex gap-3 max-w-2xl ml-auto flex-row-reverse">
          <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-[60%] rounded ml-auto" />
            <Skeleton className="h-4 w-[45%] rounded ml-auto" />
          </div>
        </div>
        {/* Assistant message */}
        <div className="flex gap-3 max-w-2xl">
          <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-[80%] rounded" />
            <Skeleton className="h-4 w-[65%] rounded" />
          </div>
        </div>
      </div>
      {/* Input bar */}
      <div className="flex-shrink-0 border-t border-border p-4">
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    </div>
  );
}
