'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DetailHeaderProps {
  backHref: string;
  backLabel: string;
  title: string;
  actions?: React.ReactNode;
  className?: string;
}

export function DetailHeader({
  backHref,
  backLabel,
  title,
  actions,
  className,
}: DetailHeaderProps) {
  return (
    <header
      className={cn(
        'bg-card border-b border-border flex-shrink-0 sticky top-0 z-20',
        'shadow-sm',
        className
      )}
    >
      <div className="px-3 py-3 sm:px-4 sm:py-4 md:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 py-1"
            >
              <ArrowLeft className="w-4 h-4 flex-shrink-0" aria-hidden />
              <span className="truncate">{backLabel}</span>
            </Link>
          </div>
          {actions && (
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              {actions}
            </div>
          )}
        </div>
        <h1 className="mt-2 text-lg font-bold text-foreground truncate sm:text-xl md:text-2xl">
          {title}
        </h1>
      </div>
    </header>
  );
}
