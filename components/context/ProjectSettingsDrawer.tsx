'use client';

import { useEffect, useState } from 'react';
import { X, Puzzle, ChevronLeft } from 'lucide-react';
import { useI18n } from '@/components/shared/I18nProvider';
import type { SerializableResolvedModule } from '@/lib/modules/registry';
import { ProjectModulesSettingsView } from './ProjectModulesSettingsView';

interface ProjectSettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  modules: SerializableResolvedModule[];
  canToggleModules: boolean;
  onModulesChange: (updated: SerializableResolvedModule[]) => void;
}

export function ProjectSettingsDrawer({
  open,
  onClose,
  projectId,
  modules,
  canToggleModules,
  onModulesChange,
}: ProjectSettingsDrawerProps) {
  const { t } = useI18n();
  const [mobileView, setMobileView] = useState<'menu' | 'modules'>('menu');

  useEffect(() => {
    if (open) setMobileView('menu');
  }, [open]);

  const showBackButton = mobileView === 'modules';
  const isMenuOnly = mobileView === 'menu';

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={onClose}
          aria-hidden
        />
      )}

      {/* Drawer panel: mobile narrow when menu, full when modules; desktop always 50% */}
      <div
        className={[
          'fixed inset-y-0 left-0 z-50 flex flex-col bg-background shadow-xl',
          'transition-[transform,width] duration-[280ms] ease-out',
          open ? 'translate-x-0' : '-translate-x-full',
          isMenuOnly ? 'w-72 md:w-1/2' : 'w-full md:w-1/2',
        ].join(' ')}
        role="dialog"
        aria-modal={open}
        aria-label={t('project_settings.drawer_title')}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3 flex-shrink-0">
          {showBackButton ? (
            <button
              onClick={() => setMobileView('menu')}
              className="flex items-center gap-1.5 rounded-md py-1.5 pr-2 -ml-1 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label={t('project_settings.back_to_menu')}
            >
              <ChevronLeft className="w-4 h-4" aria-hidden />
              <span>{t('project_settings.nav_modules')}</span>
            </button>
          ) : (
            <span className="text-base font-semibold">
              {t('project_settings.drawer_title')}
            </span>
          )}
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label={t('project_settings.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mobile: single column (menu OR content). Desktop: two columns (nav | content). */}
        <div
          className={[
            'flex flex-col md:flex-row overflow-hidden',
            isMenuOnly ? 'flex-initial md:flex-1' : 'flex-1',
          ].join(' ')}
        >
          {/* Nav: mobile = full-width list (single column); desktop = narrow sidebar; hidden on mobile when showing modules */}
          <nav
            className={[
              'flex flex-col gap-1 flex-shrink-0 p-4 md:p-2 md:w-32 md:border-r md:border-border',
              showBackButton ? 'hidden' : '',
            ].join(' ')}
          >
            <button
              type="button"
              onClick={() => setMobileView('modules')}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium bg-muted text-foreground text-left w-full md:pointer-events-none"
            >
              <Puzzle className="w-4 h-4 flex-shrink-0" aria-hidden />
              {t('project_settings.nav_modules')}
            </button>
            <button
              type="button"
              disabled
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground/40 text-left cursor-not-allowed w-full"
            >
              {t('project_settings.nav_general')}
            </button>
          </nav>

          {/* Content: on mobile menu hidden; on mobile modules and desktop always visible */}
          <div
            className={[
              'flex-1 overflow-y-auto p-4 min-w-0',
              isMenuOnly ? 'hidden md:block' : '',
            ].join(' ')}
          >
            <ProjectModulesSettingsView
              projectId={projectId}
              modules={modules}
              canToggleModules={canToggleModules}
              onModulesChange={onModulesChange}
            />
          </div>
        </div>
      </div>
    </>
  );
}
