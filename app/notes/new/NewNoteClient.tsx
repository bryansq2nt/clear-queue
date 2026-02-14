'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/types'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import { useI18n } from '@/components/I18nProvider'
import { signOut } from '@/app/actions/auth'
import { NoteEditor } from '../components/NoteEditor'

type Project = Database['public']['Tables']['projects']['Row']

function NewNoteEditorWrapper() {
  const searchParams = useSearchParams()
  const preselectedProjectId = searchParams.get('projectId')

  return (
    <NoteEditor
      mode="create"
      initialNote={{ title: '', content: '', project_id: '' }}
      initialLinks={[]}
      preselectedProjectId={preselectedProjectId}
    />
  )
}

export default function NewNoteClient() {
  const { t } = useI18n()
  const [projects, setProjects] = useState<Project[]>([])

  const loadProjects = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('projects')
      .select('*')
      .order('name')
    if (data) setProjects(data as Project[])
  }, [])

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
        projectName={t('notes.new_note')}
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
          <Suspense fallback={<p className="text-slate-500 dark:text-slate-400">Loading...</p>}>
            <NewNoteEditorWrapper />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
