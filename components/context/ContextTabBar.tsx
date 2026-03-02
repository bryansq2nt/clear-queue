'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/components/shared/I18nProvider';
import { cn } from '@/lib/utils';
import { ORDERED_MODULES, type ModuleKey } from '@/lib/modules/registry';

export interface ContextTabBarProps {
  projectId: string;
  enabledModuleKeys: Set<ModuleKey>;
}

export function ContextTabBar({
  projectId,
  enabledModuleKeys,
}: ContextTabBarProps) {
  const pathname = usePathname();
  const { t } = useI18n();
  const base = `/context/${projectId}`;

  const tabLinkClass =
    'flex items-center gap-2 px-3 py-3 min-h-[44px] flex-shrink-0 text-sm font-medium whitespace-nowrap border-b-2 transition-colors rounded-t-md';
  const activeClass = 'border-primary text-primary';
  const inactiveClass =
    'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30';

  const visibleTabs = ORDERED_MODULES.filter(
    (m) => m.nav.showInProjectTabs && enabledModuleKeys.has(m.key)
  );

  // On small screens: two rows, inverted pyramid; bottom row centered under top row
  const n = visibleTabs.length;
  const topCount = n <= 1 ? 1 : Math.min(Math.ceil(n * 0.6), n - 1);
  const topRowTabs = visibleTabs.slice(0, topCount);
  const bottomRowTabs = visibleTabs.slice(topCount);

  const renderTab = (m: (typeof visibleTabs)[0]) => {
    const { key, nav, labelKey, icon: Icon } = m;
    const href = key === 'board' ? base : `${base}/${nav.slug}`;
    const isActive =
      pathname === href ||
      (key !== 'board' && pathname?.startsWith(`${base}/${nav.slug}`));
    return (
      <Link
        key={key}
        href={href}
        className={cn(tabLinkClass, isActive ? activeClass : inactiveClass)}
      >
        <Icon className="w-4 h-4 flex-shrink-0" aria-hidden />
        <span className="hidden sm:inline">{t(labelKey)}</span>
      </Link>
    );
  };

  return (
    <nav
      className="flex w-full flex-shrink-0 border-b border-border bg-card px-4 md:px-6"
      aria-label={t('context.title')}
    >
      {/* Mobile: two rows, distribute items evenly so they occupy the horizontal space well */}
      <div className="flex w-full flex-col gap-y-1 py-1 sm:hidden">
        <div className="flex w-full flex-wrap items-center justify-evenly gap-x-2">
          {topRowTabs.map(renderTab)}
        </div>
        {bottomRowTabs.length > 0 && (
          <div className="flex w-full flex-wrap items-center justify-evenly gap-x-2">
            {bottomRowTabs.map(renderTab)}
          </div>
        )}
      </div>
      {/* Desktop: single flex wrap row */}
      <div className="hidden w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 py-1 sm:flex">
        {visibleTabs.map(renderTab)}
      </div>
    </nav>
  );
}
