'use client'

import { useCallback } from 'react'
import { useI18n } from '@/components/I18nProvider'
import { createClient } from '@/lib/supabase/client'
import TaskListWidget from './TaskListWidget'
import { Database } from '@/lib/supabase/types'

type Task = Database['public']['Tables']['tasks']['Row']
type Project = Database['public']['Tables']['projects']['Row']

interface TaskWithProject extends Task {
  projects: Project | null
}

export default function DashboardFocusTasksSection() {
  const { t } = useI18n()
  const supabase = createClient()

  // Query function for "En lo que he estado trabajando"
  const queryRecentTasks = useCallback(async (page: number, pageSize: number) => {
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const { data, count, error } = await supabase
      .from('tasks')
      .select(`
        id,
        title,
        status,
        priority,
        due_date,
        updated_at,
        project_id,
        notes,
        order_index,
        created_at,
        projects (
          id,
          name,
          color
        )
      `, { count: 'exact' })
      .neq('status', 'done')
      .order('updated_at', { ascending: false })
      .range(from, to)

    return { data, count, error }
  }, [supabase])

  // Query function for "High Priority (P5)"
  const queryHighPriorityTasks = useCallback(async (page: number, pageSize: number) => {
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const { data, count, error } = await supabase
      .from('tasks')
      .select(`
        id,
        title,
        status,
        priority,
        due_date,
        updated_at,
        project_id,
        notes,
        order_index,
        created_at,
        projects (
          id,
          name,
          color
        )
      `, { count: 'exact' })
      .eq('priority', 5)
      .neq('status', 'done')
      .order('due_date', { ascending: true, nullsFirst: false })
      .range(from, to)

    return { data, count, error }
  }, [supabase])

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
  )
}
