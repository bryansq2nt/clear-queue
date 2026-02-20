'use client';

import Link from 'next/link';
import { useI18n } from '@/components/I18nProvider';
import {
  ChevronLeft,
  Clock,
  FolderKanban,
  LayoutDashboard,
  Plus,
} from 'lucide-react';
import type { ProjectListItem } from '@/app/actions/projects';

const MAX_RECENT_HIGHLIGHT = 5;

interface ContextProjectPickerProps {
  initialProjects: ProjectListItem[];
  /** When true (e.g. on /context), show "Volver al inicio" link. When false (on /), hide it. */
  showBackButton?: boolean;
  /** When set (e.g. on /), show "Welcome back, {name}" or the returning question. */
  userDisplayName?: string;
  /** When true, user came from a project (Volver al inicio); show focus question instead of welcome. */
  returningFromProject?: boolean;
  /** When set (post-exit layer in ContextShell), show back arrow that returns to the project. */
  onBackToProject?: () => void;
  /** When set, clicking this project id uses onBackToProject instead of navigating (same project we just left). */
  backToProjectId?: string;
}

export default function ContextProjectPicker({
  initialProjects,
  showBackButton = true,
  userDisplayName,
  returningFromProject = false,
  onBackToProject,
  backToProjectId,
}: ContextProjectPickerProps) {
  const { t } = useI18n();

  const headerTitle = returningFromProject
    ? userDisplayName
      ? t('context.work_on_something_else_name', { name: userDisplayName })
      : t('context.work_on_something_else')
    : userDisplayName
      ? t('context.welcome_back_name', { name: userDisplayName })
      : t('context.pick_project');

  const recentHighlightIds = new Set(
    initialProjects
      .filter((p) => p.last_accessed_at)
      .slice(0, MAX_RECENT_HIGHLIGHT)
      .map((p) => p.id)
  );

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="bg-primary text-primary-foreground shadow flex-shrink-0">
        <div className="px-4 md:px-6 py-3 md:py-4 flex items-center gap-2 min-w-0">
          {onBackToProject ? (
            <button
              type="button"
              onClick={onBackToProject}
              className="flex-shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-md text-primary-foreground/90 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors"
              aria-label={t('context.back_to_project')}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          ) : showBackButton ? (
            <Link
              href="/"
              className="flex-shrink-0 inline-flex items-center gap-1.5 text-sm text-primary-foreground/90 hover:text-primary-foreground py-1 pr-2"
              aria-label={t('context.back_to_app')}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span className="hidden sm:inline truncate max-w-[100px]">
                {t('context.back_to_app')}
              </span>
            </Link>
          ) : (
            <div className="w-[100px] flex-shrink-0" aria-hidden />
          )}
          <h1 className="text-base md:text-xl font-bold truncate min-w-0 flex-1 text-center">
            {headerTitle}
          </h1>
          <div className="w-[100px] flex-shrink-0" aria-hidden />
        </div>
      </header>
      <main className="flex-1 overflow-auto p-4 sm:p-6">
        <p className="text-muted-foreground text-center mb-6 max-w-md mx-auto">
          {t('context.pick_project_subtitle')}
        </p>
        {initialProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 bg-card rounded-lg border border-border max-w-md mx-auto">
            <FolderKanban className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center font-medium">
              {t('context.no_projects_yet')}
            </p>
            <p className="text-muted-foreground text-center text-sm mt-2">
              {t('context.no_projects_yet_hint')}
            </p>
            <Link
              href="/projects"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:opacity-90"
            >
              <Plus className="w-4 h-4" />
              {t('sidebar.add_project')}
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl mx-auto">
            {initialProjects.map((project) => {
              const recentlyOpened = recentHighlightIds.has(project.id);
              const useBackAction =
                backToProjectId === project.id && onBackToProject;
              const cardClass = `rounded-lg border p-5 hover:shadow-md transition-all block group text-left w-full ${
                recentlyOpened
                  ? 'bg-card border-l-4 border-l-primary border-border'
                  : 'bg-card border border-border'
              }`;
              const content = (
                <>
                  <div className="flex items-start gap-2">
                    <h3 className="font-semibold text-foreground truncate flex-1 min-w-0">
                      {project.name}
                    </h3>
                    {recentlyOpened && (
                      <span title={t('context.recently_opened')}>
                        <Clock
                          className="w-4 h-4 flex-shrink-0 text-primary mt-0.5"
                          aria-label={t('context.recently_opened')}
                        />
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 truncate">
                    {project.client_name ?? t('projects.no_client')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 capitalize">
                    {project.category}
                  </p>
                </>
              );
              return useBackAction ? (
                <button
                  key={project.id}
                  type="button"
                  onClick={onBackToProject}
                  className={cardClass}
                >
                  {content}
                </button>
              ) : (
                <Link
                  key={project.id}
                  href={`/context/${project.id}/board`}
                  className={cardClass}
                  onClick={() => {
                    try {
                      sessionStorage.setItem(
                        `context_project_name_${project.id}`,
                        project.name
                      );
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  {content}
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
