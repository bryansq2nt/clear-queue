'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/components/shared/I18nProvider';
import { cn } from '@/lib/utils';
import {
  LayoutGrid,
  LogOut,
  UserCircle,
  FileText,
  Link as LinkIcon,
  Lightbulb,
  DollarSign,
  Receipt,
  CheckSquare,
  FolderOpen,
} from 'lucide-react';

export interface ContextTabBarProps {
  projectId: string;
  /** When provided, Salir triggers this instead of navigating immediately (for slide-left transition). */
  onExitStart?: () => void;
}

const TABS = [
  { slug: 'board', labelKey: 'context.stages', icon: LayoutGrid },
  { slug: 'owner', labelKey: 'context.project_owner', icon: UserCircle },
  { slug: 'notes', labelKey: 'context.notes', icon: FileText },
  { slug: 'links', labelKey: 'context.links', icon: LinkIcon },
  { slug: 'ideas', labelKey: 'context.ideas', icon: Lightbulb },
  { slug: 'budgets', labelKey: 'context.budgets', icon: DollarSign },
  { slug: 'billings', labelKey: 'context.billings', icon: Receipt },
  { slug: 'todos', labelKey: 'context.todos', icon: CheckSquare },
  { slug: 'documents', labelKey: 'context.documents', icon: FolderOpen },
] as const;

export function ContextTabBar({ projectId, onExitStart }: ContextTabBarProps) {
  const pathname = usePathname();
  const { t } = useI18n();
  const base = `/context/${projectId}`;

  const handleExit = (e: React.MouseEvent) => {
    if (onExitStart) {
      e.preventDefault();
      onExitStart();
    }
  };

  return (
    <nav
      className="flex w-full items-center border-b border-border bg-card flex-shrink-0 overflow-x-auto"
      aria-label={t('context.title')}
    >
      <div className="flex-1 min-w-0" aria-hidden />
      <div className="flex items-center justify-center min-w-0 shrink-0">
        {TABS.map(({ slug, labelKey, icon: Icon }) => {
          const href = slug === 'board' ? base : `${base}/${slug}`;
          const isActive =
            pathname === href ||
            (slug !== 'board' && pathname?.startsWith(`${base}/${slug}`));
          return (
            <Link
              key={slug}
              href={href}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="hidden sm:inline">{t(labelKey)}</span>
            </Link>
          );
        })}
      </div>
      <div className="flex flex-1 justify-end min-w-0 shrink-0">
        <Link
          href="/?from=project"
          onClick={handleExit}
          className="flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30 transition-colors"
          aria-label={t('context.exit')}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          <span className="hidden sm:inline">{t('context.exit')}</span>
        </Link>
      </div>
    </nav>
  );
}
