'use client';

import { SkeletonMediaCard } from './SkeletonMediaCard';

export function SkeletonMedia() {
  return (
    <div className="p-4 md:p-6" aria-busy="true">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <SkeletonMediaCard key={i} />
        ))}
      </div>
    </div>
  );
}
