'use client';

import Link from 'next/link';
import { useI18n } from '@/components/I18nProvider';
import { ContextTabBar } from './ContextTabBar';
import { LayoutDashboard } from 'lucide-react';

export interface ContextShellProps {
  projectId: string;
  projectName: string;
  children: React.ReactNode;
}

/**
 * Context navigation shell: header (centered project name + Volver al inicio to project selection) + tab bar + content.
 * No sidebar. Used only under /context/[projectId]/...
 */
export function ContextShell({
  projectId,
  projectName,
  children,
}: ContextShellProps) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="bg-primary text-primary-foreground shadow flex-shrink-0">
        <div className="px-4 md:px-6 py-3 md:py-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2 min-w-0">
          <div className="min-w-0" />
          <h1 className="text-base md:text-xl font-bold truncate min-w-0 text-center px-2">
            {projectName}
          </h1>
          <div className="flex justify-end min-w-0">
            <Link
              href="/?from=project"
              className="flex-shrink-0 inline-flex items-center gap-1.5 text-sm text-primary-foreground/90 hover:text-primary-foreground py-1 pl-2"
              aria-label={t('context.back_to_app')}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span className="hidden sm:inline truncate max-w-[100px]">
                {t('context.back_to_app')}
              </span>
            </Link>
          </div>
        </div>
      </header>
      <ContextTabBar projectId={projectId} />
      <main
        id="context-tab-content"
        className="relative flex-1 overflow-auto min-h-0"
      >
        {children}
      </main>
    </div>
  );
}
