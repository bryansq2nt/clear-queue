'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/types'
import { AppShell } from '@/components/AppShell'
import { useI18n } from '@/components/I18nProvider'
import IdeasDashboardClient from './IdeasDashboardClient'

type Project = Database['public']['Tables']['projects']['Row']

interface IdeasPageClientProps {
  initialBoards: any[]
  initialIdeas: any[]
  initialProjects?: { id: string; name: string }[]
}

export default function IdeasPageClient({
  initialBoards,
  initialIdeas,
  initialProjects = [],
}: IdeasPageClientProps) {
  const { t } = useI18n()
  const router = useRouter()
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
        <div className="text-lg">Loading...</div>
      </div>
    )
  }

  return (
    <AppShell
      title={t('sidebar.idea_graph')}
      projects={projects}
      selectedProject={null}
      selectedCategory={null}
      showArchived={false}
      onSelectProject={(id) => {
        if (id) router.push(`/project/${id}`)
        else router.push('/dashboard')
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
  )
}
