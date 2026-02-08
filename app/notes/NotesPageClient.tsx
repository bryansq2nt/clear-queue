'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/types'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import { signOut } from '@/app/actions/auth'
import { Plus, FileText, MoreVertical, Edit, Trash2, ExternalLink } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getNotes, deleteNote } from '@/app/notes/actions'
import { getProjects } from '@/app/budgets/actions'

type Project = Database['public']['Tables']['projects']['Row']
type Note = Database['public']['Tables']['notes']['Row']

function formatUpdatedAt(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000))
  if (diffDays === 0) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return d.toLocaleDateString()
}

function NotesPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectIdFromUrl = searchParams.get('projectId')

  const [projects, setProjects] = useState<Project[]>([])
  const [projectList, setProjectList] = useState<{ id: string; name: string }[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [projectFilter, setProjectFilter] = useState<string>(projectIdFromUrl || 'all')
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    if (projectIdFromUrl) setProjectFilter(projectIdFromUrl)
  }, [projectIdFromUrl])

  const loadProjects = useCallback(async () => {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: true })
    if (data) setProjects(data as Project[])
    const list = await getProjects()
    setProjectList(list)
  }, [supabase])

  const loadNotes = useCallback(async () => {
    setIsLoading(true)
    const data = await getNotes({
      projectId: projectFilter === 'all' ? undefined : projectFilter,
    })
    setNotes(data)
    setIsLoading(false)
  }, [projectFilter])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  useEffect(() => {
    loadNotes()
  }, [loadNotes])

  const projectNameById = (id: string) => {
    const p = projectList.find((x) => x.id === id) || projects.find((p) => p.id === id)
    return p?.name ?? 'Unknown project'
  }

  const handleDelete = async (e: React.MouseEvent, note: Note) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm(`Delete note "${note.title}"?`)) return
    const { error } = await deleteNote(note.id)
    if (error) {
      alert(error)
      return
    }
    loadNotes()
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <TopBar
        searchQuery=""
        onSearchChange={() => {}}
        onSignOut={() => signOut()}
        onProjectAdded={loadProjects}
        onProjectUpdated={loadProjects}
        projectName="Notes"
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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Notes
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Notes linked to your projects.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {projectList.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={() => router.push('/notes/new')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 font-medium"
              >
                <Plus className="w-4 h-4" />
                New Note
              </button>
            </div>
          </div>

          {isLoading ? (
            <p className="text-sm text-slate-500">Loading...</p>
          ) : notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <FileText className="w-12 h-12 text-slate-400 dark:text-slate-500 mb-4" />
              <p className="text-slate-600 dark:text-slate-400 text-center mb-6">
                No notes yet. Create a note linked to a project.
              </p>
              <button
                type="button"
                onClick={() => router.push('/notes/new')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 font-medium"
              >
                <Plus className="w-4 h-4" />
                New Note
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {notes.map((note) => (
                <div
                  key={note.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/notes/${note.id}`)}
                  onKeyDown={(e) => e.key === 'Enter' && router.push(`/notes/${note.id}`)}
                  className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md transition-all cursor-pointer group relative"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                        {note.title}
                      </h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                        {projectNameById(note.project_id)}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                        {formatUpdatedAt(note.updated_at)}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          className="p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          <MoreVertical className="w-4 h-4 text-gray-500" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem onClick={() => router.push(`/notes/${note.id}`)}>
                          <ExternalLink className="w-4 h-4 mr-2" />
                          View
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => router.push(`/notes/${note.id}`)}>
                          <Edit className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => handleDelete(e, note)}
                          className="text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function NotesPageClient() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
      <NotesPageContent />
    </Suspense>
  )
}
