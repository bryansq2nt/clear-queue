'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/types'
import KanbanBoard from './KanbanBoard'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import RightPanel from './RightPanel'
import { signOut } from '@/app/actions/auth'
import { useRouter } from 'next/navigation'
import { SelectionActionBar } from './SelectionActionBar'
import { deleteTasksByIds } from '@/app/actions/tasks'
import { cn } from '@/lib/utils'

type Project = Database['public']['Tables']['projects']['Row']
type Task = Database['public']['Tables']['tasks']['Row']

interface ProjectKanbanClientProps {
  projectId: string
}

export default function ProjectKanbanClient({ projectId }: ProjectKanbanClientProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const [currentProject, setCurrentProject] = useState<Project | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)
  const router = useRouter()

  const supabase = createClient()

  // Selection mode helpers
  const toggleTaskSelection = useCallback((taskId: string) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) {
        next.delete(taskId)
      } else {
        next.add(taskId)
      }
      return next
    })
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedTaskIds(new Set())
    setSelectionMode(false)
  }, [])

  const enterSelectionMode = useCallback((initialId?: string) => {
    setSelectionMode(true)
    if (initialId) {
      setSelectedTaskIds(new Set([initialId]))
    }
  }, [])

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false)
    setSelectedTaskIds(new Set())
  }, [])

  // ESC key handler
  useEffect(() => {
    if (!selectionMode) return

    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        exitSelectionMode()
      }
    }

    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [selectionMode, exitSelectionMode])

  // Bulk delete handler
  async function handleBulkDelete() {
    if (selectedTaskIds.size === 0) return

    setIsDeleting(true)
    const ids = Array.from(selectedTaskIds)

    // Optimistic update
    setTasks(prev => prev.filter(t => !ids.includes(t.id)))
    setSelectedTaskIds(new Set())
    setSelectionMode(false)

    const result = await deleteTasksByIds(ids)

    if (result.error) {
      // Revert on error
      loadData()
      alert('Failed to delete tasks: ' + result.error)
    } else {
      // Refresh data
      loadData()
    }

    setIsDeleting(false)
  }

  useEffect(() => {
    loadData()
  }, [projectId])

  async function loadData() {
    setLoading(true)

    const [projectsRes, projectRes, tasksRes] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: true }),
      supabase.from('projects').select('*').eq('id', projectId).single(),
      supabase.from('tasks').select('*').eq('project_id', projectId).order('order_index', { ascending: true }),
    ]) as any

    if (projectsRes?.data) setProjects(projectsRes.data as Project[])
    if (projectRes?.data) setCurrentProject(projectRes.data as Project)
    if (tasksRes?.data) setTasks(tasksRes.data as Task[])

    setLoading(false)
  }

  const filteredTasks = tasks.filter(task => {
    if (searchQuery && !task.title.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const today = new Date().toISOString().split('T')[0]
  const todayTasks = filteredTasks.filter(task => {
    if (!task.due_date) return false
    return task.due_date <= today && task.status !== 'done'
  })

  const nextUpTasks = filteredTasks
    .filter(task => task.status === 'next')
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    )
  }

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Project not found</div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Sidebar
        projects={projects}
        selectedProject={projectId}
        selectedCategory={selectedCategory}
        showArchived={showArchived}
        onSelectProject={(id) => {
          if (id) {
            router.push(`/project/${id}`)
          } else {
            router.push('/dashboard')
          }
        }}
        onCategoryChange={setSelectedCategory}
        onShowArchivedChange={setShowArchived}
        onProjectUpdated={loadData}
      />
      <div className="flex-1 flex flex-col">
        <TopBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSignOut={signOut}
          onProjectAdded={loadData}
          onProjectUpdated={loadData}
          projectName={currentProject.name}
          currentProject={currentProject}
          selectionMode={selectionMode}
          onToggleSelectionMode={() => {
            if (selectionMode) {
              exitSelectionMode()
            } else {
              enterSelectionMode()
            }
          }}
        />
        <div className="flex-1 flex overflow-hidden">
          <div className={cn("flex-1 overflow-x-auto", selectionMode && "pb-20")}>
            <KanbanBoard
              tasks={filteredTasks}
              projects={projects}
              onTaskUpdate={loadData}
              currentProjectId={projectId}
              selectionMode={selectionMode}
              selectedTaskIds={selectedTaskIds}
              onToggleSelection={toggleTaskSelection}
              onEnterSelectionMode={enterSelectionMode}
            />
          </div>
          <RightPanel
            todayTasks={todayTasks}
            nextUpTasks={nextUpTasks}
            projects={projects}
          />
        </div>
        {selectionMode && (
          <SelectionActionBar
            selectedCount={selectedTaskIds.size}
            onDelete={handleBulkDelete}
            onCancel={exitSelectionMode}
            isDeleting={isDeleting}
          />
        )}
      </div>
    </div>
  )
}
