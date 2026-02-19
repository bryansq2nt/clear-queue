import { cn } from '@/lib/utils';

/**
 * Base skeleton with shimmer. Use for loading placeholders.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('cq-skeleton-shimmer', className)}
      aria-hidden
      {...props}
    />
  );
}
