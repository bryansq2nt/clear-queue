'use client';

import Link from 'next/link';
import { useState, type ComponentProps } from 'react';

type Props = ComponentProps<typeof Link>;

/**
 * A Next.js Link that only prefetches on mouse hover, not on viewport entry.
 * Use for list items where N items are visible but only 1–2 will be clicked.
 */
export function HoverPrefetchLink({ onMouseEnter, ...props }: Props) {
  const [shouldPrefetch, setShouldPrefetch] = useState(false);
  return (
    <Link
      {...props}
      prefetch={shouldPrefetch}
      onMouseEnter={(e) => {
        setShouldPrefetch(true);
        onMouseEnter?.(e);
      }}
    />
  );
}
