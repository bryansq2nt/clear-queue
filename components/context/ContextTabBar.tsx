'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/components/I18nProvider';
import { cn } from '@/lib/utils';
import {
  LayoutGrid,
  UserCircle,
  FileText,
  Lightbulb,
  DollarSign,
  CheckSquare,
} from 'lucide-react';

export interface ContextTabBarProps {
  projectId: string;
}

const TABS = [
  { slug: 'board', labelKey: 'context.board', icon: LayoutGrid },
  { slug: 'owner', labelKey: 'context.project_owner', icon: UserCircle },
  { slug: 'notes', labelKey: 'context.notes', icon: FileText },
  { slug: 'ideas', labelKey: 'context.ideas', icon: Lightbulb },
  { slug: 'budgets', labelKey: 'context.budgets', icon: DollarSign },
  { slug: 'todos', labelKey: 'context.todos', icon: CheckSquare },
] as const;

export function ContextTabBar({ projectId }: ContextTabBarProps) {
  const pathname = usePathname();
  const { t } = useI18n();
  const base = `/context/${projectId}`;

  return (
    <nav
      className="flex items-center gap-0 border-b border-border bg-card flex-shrink-0 overflow-x-auto"
      aria-label={t('context.title')}
    >
      <div className="flex min-w-0">
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
    </nav>
  );
}
