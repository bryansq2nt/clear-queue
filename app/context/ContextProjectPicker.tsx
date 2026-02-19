'use client';

import Link from 'next/link';
import { useI18n } from '@/components/I18nProvider';
import { FolderKanban, LayoutDashboard } from 'lucide-react';
import type { ProjectListItem } from '@/app/actions/projects';

interface ContextProjectPickerProps {
  initialProjects: ProjectListItem[];
}

export default function ContextProjectPicker({
  initialProjects,
}: ContextProjectPickerProps) {
  const { t } = useI18n();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="bg-primary text-primary-foreground shadow flex-shrink-0">
        <div className="px-4 md:px-6 py-3 md:py-4 flex items-center gap-2 min-w-0">
          <Link
            href="/dashboard"
            className="flex-shrink-0 inline-flex items-center gap-1.5 text-sm text-primary-foreground/90 hover:text-primary-foreground py-1 pr-2"
            aria-label={t('context.back_to_app')}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span className="hidden sm:inline truncate max-w-[100px]">
              {t('context.back_to_app')}
            </span>
          </Link>
          <h1 className="text-base md:text-xl font-bold truncate min-w-0 flex-1 text-center">
            {t('context.pick_project')}
          </h1>
          <div className="w-[100px] flex-shrink-0" aria-hidden />
        </div>
      </header>
      <main className="flex-1 overflow-auto p-4 sm:p-6">
        <p className="text-muted-foreground text-center mb-6 max-w-md mx-auto">
          {t('context.pick_project_subtitle')}
        </p>
        {initialProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 bg-card rounded-lg border border-border">
            <FolderKanban className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              {t('projects.no_projects_yet')}
            </p>
            <Link
              href="/projects"
              className="mt-4 text-sm text-primary hover:underline"
            >
              {t('sidebar.my_projects')}
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl mx-auto">
            {initialProjects.map((project) => (
              <Link
                key={project.id}
                href={`/context/${project.id}/board`}
                className="bg-card rounded-lg border border-border p-5 hover:shadow-md transition-all block group"
              >
                <h3 className="font-semibold text-foreground truncate">
                  {project.name}
                </h3>
                <p className="text-sm text-muted-foreground mt-1 truncate">
                  {project.client_name ?? t('projects.no_client')}
                </p>
                <p className="text-xs text-muted-foreground mt-1 capitalize">
                  {project.category}
                </p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
