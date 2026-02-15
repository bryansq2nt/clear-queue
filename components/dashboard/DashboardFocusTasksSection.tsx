'use client';

import { useCallback } from 'react';
import { useI18n } from '@/components/I18nProvider';
import {
  getRecentTasksPage,
  getHighPriorityTasksPage,
} from '@/app/actions/tasks';
import TaskListWidget from './TaskListWidget';
import { Database } from '@/lib/supabase/types';

type Task = Database['public']['Tables']['tasks']['Row'];
type Project = Database['public']['Tables']['projects']['Row'];

interface TaskWithProject extends Task {
  projects: Project | null;
}

export default function DashboardFocusTasksSection() {
  const { t } = useI18n();

  const queryRecentTasks = useCallback(
    async (page: number, pageSize: number) => {
      const res = await getRecentTasksPage(page, pageSize);
      return {
        data: res.data,
        count: res.count,
        error: res.error,
      };
    },
    []
  );

  const queryHighPriorityTasks = useCallback(
    async (page: number, pageSize: number) => {
      const res = await getHighPriorityTasksPage(page, pageSize);
      return {
        data: res.data,
        count: res.count,
        error: res.error,
      };
    },
    []
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Right: High Priority (P5) */}
      <TaskListWidget
        title={t('tasks.maxima_prioridad')}
        viewAllLink="/dashboard"
        queryFn={queryHighPriorityTasks}
        emptyMessage={t('tasks.no_max_priority')}
        showUpdatedAt={false}
        borderColor="border-red-500"
        bgColor="bg-red-500/10 dark:bg-red-500/20"
      />

      {/* Left: En lo que he estado trabajando */}
      <TaskListWidget
        title={t('tasks.recent_work')}
        viewAllLink="/dashboard"
        queryFn={queryRecentTasks}
        emptyMessage={t('tasks.no_recent')}
        showUpdatedAt={true}
        borderColor="border-blue-500"
        bgColor="bg-blue-500/10 dark:bg-blue-500/20"
      />
    </div>
  );
}
