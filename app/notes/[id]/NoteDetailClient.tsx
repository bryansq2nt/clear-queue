'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/types'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import { signOut } from '@/app/actions/auth'
import { NoteEditor } from '../components/NoteEditor'

type Project = Database['public']['Tables']['projects']['Row']
type NoteLink = Database['public']['Tables']['note_links']['Row']

interface NoteDetailClientProps {
  noteId: string
  initialNote: { title: string; content: string; project_id: string }
  initialLinks: NoteLink[]
}

export default function NoteDetailClient({
  noteId,
  initialNote,
  initialLinks,
}: NoteDetailClientProps) {
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
        projectName={initialNote.title || 'Note'}
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
          <NoteEditor
            mode="edit"
            noteId={noteId}
            initialNote={initialNote}
            initialLinks={initialLinks}
          />
        </div>
      </div>
    </div>
  )
}
