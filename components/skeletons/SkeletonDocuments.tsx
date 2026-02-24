'use client';

import { SkeletonDocumentRow } from './SkeletonDocumentRow';

const ROW_COUNT = 5;

/**
 * Full-list skeleton for the Documents tab.
 * Renders N shimmer rows that match real DocumentRow dimensions.
 * No spinner, no "Loading..." text.
 */
export function SkeletonDocuments() {
  return (
    <div
      className="flex flex-col bg-card rounded-lg border border-border overflow-hidden"
      aria-busy="true"
    >
      {Array.from({ length: ROW_COUNT }).map((_, i) => (
        <SkeletonDocumentRow key={i} />
      ))}
    </div>
  );
}
