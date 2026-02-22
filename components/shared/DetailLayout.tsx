'use client';

import { cn } from '@/lib/utils';
import { GlobalHeader } from './GlobalHeader';

interface DetailLayoutProps {
  /** e.g. /budgets, /clients */
  backHref: string;
  /** i18n key or text for back link; empty string = only arrow icon */
  backLabel?: string;
  /** Page title shown in header */
  title: string;
  children: React.ReactNode;
  /** Optional class for main content area (e.g. p-4 sm:p-6 max-w-7xl mx-auto) */
  contentClassName?: string;
  /** Optional actions (Edit, Delete, etc.) shown in header */
  actions?: React.ReactNode;
}

/**
 * Full-height layout for detail views: GlobalHeader (back + title only), no sidebar/search.
 * Mobile-friendly and responsive.
 */
export function DetailLayout({
  backHref,
  backLabel = '',
  title,
  children,
  contentClassName,
  actions,
}: DetailLayoutProps) {
  return (
    <div className="flex flex-col h-screen bg-background">
      <GlobalHeader
        backHref={backHref}
        backLabel={backLabel}
        title={title}
        rightAction={actions}
      />
      <main className={cn('flex-1 overflow-y-auto min-h-0', contentClassName)}>
        {children}
      </main>
    </div>
  );
}
