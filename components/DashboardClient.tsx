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
  const [selectedPriority, setSelectedPriority] = useState<number | null>(null)
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
    if (selectedPriority && task.priority !== selectedPriority) return false
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

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar
        projects={projects}
        selectedProject={selectedProject}
        onSelectProject={setSelectedProject}
        onProjectAdded={loadData}
      />
      <div className="flex-1 flex flex-col">
        <TopBar
          projects={projects}
          selectedProject={selectedProject}
          selectedPriority={selectedPriority}
          searchQuery={searchQuery}
          onProjectChange={setSelectedProject}
          onPriorityChange={setSelectedPriority}
          onSearchChange={setSearchQuery}
          onSignOut={signOut}
        />
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-auto">
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
    </div>
  )
}
