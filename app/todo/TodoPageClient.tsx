'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/types'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import { signOut } from '@/app/actions/auth'
import TodoDashboardClient from './TodoDashboardClient'
import { useI18n } from '@/components/I18nProvider'

type Project = Database['public']['Tables']['projects']['Row']

export default function TodoPageClient() {
  const { t } = useI18n()
  const [projects, setProjects] = useState<Project[]>([])
  const [searchQuery, setSearchQuery] = useState('')
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
    <div className="flex flex-col h-screen bg-background">
      <TopBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSignOut={() => signOut()}
        onProjectAdded={loadProjects}
        onProjectUpdated={loadProjects}
        projectName="To-do"
        currentProject={null}
      />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          projects={projects}
          selectedProject={null}
          selectedCategory={null}
          showArchived={false}
          onSelectProject={() => {}}
          onCategoryChange={() => {}}
          onShowArchivedChange={() => {}}
          onProjectUpdated={loadProjects}
        />
        <div className="flex-1 overflow-y-auto p-6">
          <TodoDashboardClient />
        </div>
      </div>
    </div>
  )
}
