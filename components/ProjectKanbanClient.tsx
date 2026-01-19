'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/types'
import KanbanBoard from './KanbanBoard'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import RightPanel from './RightPanel'
import { signOut } from '@/app/actions/auth'
import { useRouter } from 'next/navigation'

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
  const router = useRouter()

  const supabase = createClient()

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
        />
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-x-auto">
            <KanbanBoard
              tasks={filteredTasks}
              projects={projects}
              onTaskUpdate={loadData}
              currentProjectId={projectId}
            />
          </div>
          <RightPanel
            todayTasks={todayTasks}
            nextUpTasks={nextUpTasks}
            projects={projects}
          />
        </div>
      </div>
    </div>
  )
}
