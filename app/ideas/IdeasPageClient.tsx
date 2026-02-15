'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Database } from '@/lib/supabase/types';
import { getProjectsForSidebar } from '@/app/actions/projects';
import { AppShell } from '@/components/AppShell';
import { useI18n } from '@/components/I18nProvider';
import IdeasDashboardClient from './IdeasDashboardClient';

type Project = Database['public']['Tables']['projects']['Row'];

interface IdeasPageClientProps {
  initialBoards: any[];
  initialIdeas: any[];
  initialProjects?: { id: string; name: string }[];
}

export default function IdeasPageClient({
  initialBoards,
  initialIdeas,
  initialProjects = [],
}: IdeasPageClientProps) {
  const { t } = useI18n();
  const router = useRouter();
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
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

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
