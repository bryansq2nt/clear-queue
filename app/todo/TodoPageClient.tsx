'use client';

import { useState, useCallback } from 'react';
import { Database } from '@/lib/supabase/types';
import { getProjectsForSidebar } from '@/app/actions/projects';
import { AppShell } from '@/components/AppShell';
import TodoDashboardClient from './TodoDashboardClient';
import { useI18n } from '@/components/I18nProvider';

type Project = Database['public']['Tables']['projects']['Row'];

interface TodoPageClientProps {
  initialProjects: Project[];
}

export default function TodoPageClient({
  initialProjects,
}: TodoPageClientProps) {
  const { t } = useI18n();
  const [projects, setProjects] = useState<Project[]>(initialProjects);

  const loadProjects = useCallback(async () => {
    const data = await getProjectsForSidebar();
    setProjects(data);
  }, []);

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
