'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import TopBar from '@/components/TopBar'
import { useI18n } from '@/components/I18nProvider'
import { signOut } from '@/app/actions/auth'
import { NoteEditor } from '../components/NoteEditor'

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

  return (
    <div className="flex flex-col h-screen bg-background">
      <TopBar
        searchQuery=""
        onSearchChange={() => {}}
        onSignOut={() => signOut()}
        onProjectAdded={() => {}}
        onProjectUpdated={() => {}}
        projectName={t('notes.new_note')}
        currentProject={null}
        minimal
        backHref="/notes"
        backLabel=""
      />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <Suspense fallback={<p className="text-muted-foreground">Loading...</p>}>
          <NewNoteEditorWrapper />
        </Suspense>
      </main>
    </div>
  )
}
