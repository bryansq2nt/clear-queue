'use client';

import { useEffect, useState } from 'react';
import { X, Puzzle, ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/shared/I18nProvider';
import type { SerializableResolvedModule } from '@/lib/modules/registry';
import { ProjectModulesSettingsView } from './ProjectModulesSettingsView';
import { deleteProject } from '@/app/actions/projects';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ProjectSettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  modules: SerializableResolvedModule[];
  canToggleModules: boolean;
  canDeleteProject: boolean;
  onModulesChange: (updated: SerializableResolvedModule[]) => void;
}

export function ProjectSettingsDrawer({
  open,
  onClose,
  projectId,
  projectName,
  modules,
  canToggleModules,
  canDeleteProject,
  onModulesChange,
}: ProjectSettingsDrawerProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [mobileView, setMobileView] = useState<'menu' | 'modules' | 'general'>(
    'menu'
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMobileView('menu');
      setShowDeleteConfirm(false);
      setConfirmName('');
      setIsDeleting(false);
      setError(null);
    }
  }, [open]);

  const showBackButton = mobileView !== 'menu';
  const isMenuOnly = mobileView === 'menu';
  const isGeneralView = mobileView === 'general' || !canToggleModules;

  async function handleDeleteProject() {
    setIsDeleting(true);
    setError(null);
    const result = await deleteProject(projectId);
    if (!result.ok) {
      setError(result.error);
      setIsDeleting(false);
      return;
    }
    onClose();
    router.push('/context');
  }

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
              <span>
                {canToggleModules
                  ? t('project_settings.nav_modules')
                  : t('project_settings.nav_general')}
              </span>
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
            {canToggleModules && (
              <button
                type="button"
                onClick={() => setMobileView('modules')}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-left w-full ${
                  mobileView === 'modules'
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                }`}
              >
                <Puzzle className="w-4 h-4 flex-shrink-0" aria-hidden />
                {t('project_settings.nav_modules')}
              </button>
            )}
            <button
              type="button"
              onClick={() => setMobileView('general')}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm text-left w-full ${
                mobileView === 'general'
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              }`}
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
            {isGeneralView ? (
              <div className="space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    {t('project_settings.nav_general')}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t('projects.edit_description')}
                  </p>
                </div>

                {!canDeleteProject ? (
                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <p className="text-sm text-muted-foreground">
                      {t('projects.delete_owner_only')}
                    </p>
                  </div>
                ) : !showDeleteConfirm ? (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-3">
                    <p className="text-sm text-foreground">{projectName}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('projects.delete_warning_tasks')}
                    </p>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => setShowDeleteConfirm(true)}
                    >
                      {t('projects.delete_project')}
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-3">
                    <p className="text-sm font-semibold text-destructive">
                      {t('projects.delete_warning')}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t('projects.delete_confirm', { name: projectName })}
                    </p>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">
                        {t('projects.delete_confirm_name')}
                      </label>
                      <Input
                        value={confirmName}
                        onChange={(e) => setConfirmName(e.target.value)}
                        placeholder={projectName}
                        disabled={isDeleting}
                        autoComplete="off"
                      />
                    </div>
                    {error && (
                      <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                        {error}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setShowDeleteConfirm(false);
                          setConfirmName('');
                          setError(null);
                        }}
                        disabled={isDeleting}
                      >
                        {t('common.cancel')}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={handleDeleteProject}
                        disabled={isDeleting || confirmName !== projectName}
                      >
                        {isDeleting
                          ? t('projects.deleting')
                          : t('projects.delete_confirm_btn')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <ProjectModulesSettingsView
                projectId={projectId}
                modules={modules}
                canToggleModules={canToggleModules}
                onModulesChange={onModulesChange}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
