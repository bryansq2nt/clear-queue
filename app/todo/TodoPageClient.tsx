'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/types'
import { AppShell } from '@/components/AppShell'
import TodoDashboardClient from './TodoDashboardClient'
import { useI18n } from '@/components/I18nProvider'

type Project = Database['public']['Tables']['projects']['Row']

export default function TodoPageClient() {
  const { t } = useI18n()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const loadProjects = useCallback(async () => {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: true })

    if (data) {
      setProjects(data as Project[])
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">{t('common.loading')}</div>
      </div>
    )
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
  )
}
