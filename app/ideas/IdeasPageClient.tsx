'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Database } from '@/lib/supabase/types';
import { getProjectsForSidebar } from '@/app/actions/projects';
import { AppShell } from '@/components/AppShell';
import { useI18n } from '@/components/I18nProvider';
import IdeasDashboardClient from './IdeasDashboardClient';

type Project = Database['public']['Tables']['projects']['Row'];

interface IdeasPageClientProps {
  initialSidebarProjects: Project[];
  initialBoards: any[];
  initialIdeas: any[];
  initialProjects?: { id: string; name: string }[];
}

export default function IdeasPageClient({
  initialSidebarProjects,
  initialBoards,
  initialIdeas,
  initialProjects = [],
}: IdeasPageClientProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>(initialSidebarProjects);

  const loadProjects = useCallback(async () => {
    const data = await getProjectsForSidebar();
    setProjects(data);
  }, []);

  return (
    <AppShell
      title={t('sidebar.idea_graph')}
      projects={projects}
      selectedProject={null}
      selectedCategory={null}
      showArchived={false}
      onSelectProject={(id) => {
        if (id) router.push(`/project/${id}`);
        else router.push('/dashboard');
      }}
      onCategoryChange={() => {}}
      onShowArchivedChange={() => {}}
      onProjectUpdated={loadProjects}
    >
      <IdeasDashboardClient
        initialBoards={initialBoards}
        initialIdeas={initialIdeas}
        initialProjects={initialProjects}
      />
    </AppShell>
  );
}
