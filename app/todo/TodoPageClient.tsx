'use client';

import { useState, useEffect, useCallback } from 'react';
import { Database } from '@/lib/supabase/types';
import { getProjectsForSidebar } from '@/app/actions/projects';
import { AppShell } from '@/components/AppShell';
import TodoDashboardClient from './TodoDashboardClient';
import { useI18n } from '@/components/I18nProvider';

type Project = Database['public']['Tables']['projects']['Row'];

export default function TodoPageClient() {
  const { t } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProjects = useCallback(async () => {
    const data = await getProjectsForSidebar();
    setProjects(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <AppShell
      title={t('todo.title')}
      projects={projects}
      selectedProject={null}
      selectedCategory={null}
      showArchived={false}
      onSelectProject={() => {}}
      onCategoryChange={() => {}}
      onShowArchivedChange={() => {}}
      onProjectUpdated={loadProjects}
      contentClassName="p-6"
    >
      <TodoDashboardClient />
    </AppShell>
  );
}
