'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/types'
import KanbanBoard from './KanbanBoard'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import RightPanel from './RightPanel'
import { signOut } from '@/app/actions/auth'

type Project = Database['public']['Tables']['projects']['Row']
type Task = Database['public']['Tables']['tasks']['Row']

export default function DashboardClient() {
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)

    const [projectsRes, tasksRes] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: true }),
      supabase.from('tasks').select('*').order('order_index', { ascending: true }),
    ])

    if (projectsRes.data) setProjects(projectsRes.data)
    if (tasksRes.data) setTasks(tasksRes.data)

    setLoading(false)
  }

  const filteredTasks = tasks.filter(task => {
    if (selectedProject && task.project_id !== selectedProject) return false
    if (searchQuery && !task.title.toLowerCase().includes(searchQuery.toLowerCase())) return false

    // Filter out archived projects if showArchived is false
    if (!showArchived) {
      const taskProject = projects.find(p => p.id === task.project_id)
      if (taskProject && taskProject.category === 'archived') return false
    }

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

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <TopBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSignOut={signOut}
        onProjectAdded={loadData}
        onProjectUpdated={loadData}
        projectName='Dashboard'
        currentProject={null}
      />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          projects={projects}
          selectedProject={selectedProject}
          selectedCategory={selectedCategory}
          showArchived={showArchived}
          onSelectProject={setSelectedProject}
          onCategoryChange={setSelectedCategory}
          onShowArchivedChange={setShowArchived}
          onProjectUpdated={loadData}
        />
        <div className="flex-1 overflow-x-auto">
          <KanbanBoard
            tasks={filteredTasks}
            projects={projects}
            onTaskUpdate={loadData}
          />
        </div>
        <RightPanel
          todayTasks={todayTasks}
          nextUpTasks={nextUpTasks}
          projects={projects}
        />
      </div>
    </div>
  )
}
