'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/components/shared/I18nProvider';
import { cn } from '@/lib/utils';
import {
  LayoutGrid,
  UserCircle,
  FileText,
  Link as LinkIcon,
  Lightbulb,
  DollarSign,
  Receipt,
  CheckSquare,
  FolderOpen,
  Image,
} from 'lucide-react';

export interface ContextTabBarProps {
  projectId: string;
}

const TABS = [
  { slug: 'board', labelKey: 'context.stages', icon: LayoutGrid },
  { slug: 'owner', labelKey: 'context.project_owner', icon: UserCircle },
  { slug: 'documents', labelKey: 'context.documents', icon: FolderOpen },
  { slug: 'media', labelKey: 'context.media', icon: Image },
  { slug: 'notes', labelKey: 'context.notes', icon: FileText },
  { slug: 'links', labelKey: 'context.links', icon: LinkIcon },
  { slug: 'ideas', labelKey: 'context.ideas', icon: Lightbulb },
  { slug: 'budgets', labelKey: 'context.budgets', icon: DollarSign },
  { slug: 'billings', labelKey: 'context.billings', icon: Receipt },
  //{ slug: 'todos', labelKey: 'context.todos', icon: CheckSquare },
] as const;

export function ContextTabBar({ projectId }: ContextTabBarProps) {
  const pathname = usePathname();
  const { t } = useI18n();
  const base = `/context/${projectId}`;

  const tabLinkClass =
    'flex items-center gap-2 px-3 py-3 min-h-[44px] flex-shrink-0 text-sm font-medium whitespace-nowrap border-b-2 transition-colors rounded-t-md';
  const activeClass = 'border-primary text-primary';
  const inactiveClass =
    'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30';

  return (
    <nav
      className="flex w-full flex-shrink-0 border-b border-border bg-card px-4 md:px-6"
      aria-label={t('context.title')}
    >
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 py-1 w-full">
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
                tabLinkClass,
                isActive ? activeClass : inactiveClass
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" aria-hidden />
              <span className="hidden sm:inline">{t(labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
