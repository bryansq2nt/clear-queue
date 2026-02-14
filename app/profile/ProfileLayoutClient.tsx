'use client'

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/components/I18nProvider'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/types'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import { signOut } from '@/app/actions/auth'

type Project = Database['public']['Tables']['projects']['Row']

export default function ProfileLayoutClient({
  children,
}: {
  children: React.ReactNode
}) {
  const { t } = useI18n()
  const [projects, setProjects] = useState<Project[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const supabase = createClient()

  const loadProjects = useCallback(async () => {
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: true })
    if (data) setProjects(data as Project[])
  }, [supabase])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  return (
    <div className="flex flex-col h-screen bg-background">
      <TopBar
        searchQuery=""
        onSearchChange={() => {}}
        onSignOut={() => signOut()}
        onProjectAdded={loadProjects}
        onProjectUpdated={loadProjects}
        projectName={t('settings.profile')}
        currentProject={null}
        onOpenSidebar={() => setSidebarOpen(true)}
        minimal
        showSidebarButtonAlways
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
          mobileOpen={sidebarOpen}
          onMobileClose={() => setSidebarOpen(false)}
          overlayOnly
        />
        <main className="flex-1 overflow-y-auto flex flex-col">
          {children}
        </main>
      </div>
    </div>
  )
}
