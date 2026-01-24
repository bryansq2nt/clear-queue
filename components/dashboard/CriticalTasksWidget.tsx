'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/types'
import { EditTaskModal } from '../EditTaskModal'
import Link from 'next/link'

type Task = Database['public']['Tables']['tasks']['Row']
type Project = Database['public']['Tables']['projects']['Row']

interface CriticalTask extends Task {
  projects: Project | null
}

const statusLabels = {
  backlog: "Pendientes",
  next: "Lo Siguiente",
  in_progress: "En Progreso",
  blocked: "Bloqueado",
  done: "Terminado",
} as const

const statusColors = {
  backlog: "bg-gray-100 text-gray-700",
  next: "bg-yellow-100 text-yellow-700",
  in_progress: "bg-blue-100 text-blue-700",
  blocked: "bg-red-100 text-red-700",
  done: "bg-green-100 text-green-700",
} as const

function formatDate(dateString: string | null): string {
  if (!dateString) return "📅 Sin fecha"
  const date = new Date(dateString)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `📅 ${day}/${month}/${year}`
}

export default function CriticalTasksWidget() {
  const [criticalTasks, setCriticalTasks] = useState<CriticalTask[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const supabase = createClient()

  const loadCriticalTasks = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('tasks')
      .select(`
        id,
        title,
        status,
        priority,
        due_date,
        project_id,
        notes,
        order_index,
        created_at,
        updated_at,
        projects (
          id,
          name,
          color
        )
      `)
      .eq('priority', 5)
      .neq('status', 'done')
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(5)

    if (error) {
      console.error('Error loading critical tasks:', error)
      setLoading(false)
      return
    }

    // Transform the data to flatten the projects relation
    // Supabase returns the relation as an object (not array) for one-to-many relationships
    const transformedTasks = (data || []).map((task: any) => {
      let project: Project | null = null
      if (task.projects) {
        // Handle both array and object cases
        if (Array.isArray(task.projects)) {
          project = task.projects.length > 0 ? task.projects[0] : null
        } else {
          project = task.projects
        }
      }
      return {
        ...task,
        projects: project,
      }
    }) as CriticalTask[]

    setCriticalTasks(transformedTasks)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    loadCriticalTasks()
  }, [loadCriticalTasks])

  function handleTaskClick(task: Task) {
    setSelectedTask(task)
    setIsModalOpen(true)
  }

  function handleTaskUpdate() {
    loadCriticalTasks()
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow p-5 border border-slate-200">
        <div className="text-slate-600">Cargando tareas críticas...</div>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white rounded-xl shadow p-5 border border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-slate-900">🎯 Mis Tareas Críticas</h2>
          <Link
            href="/dashboard"
            className="text-blue-600 hover:text-blue-700 text-sm font-medium transition-colors"
          >
            Ver todas →
          </Link>
        </div>

        {criticalTasks.length === 0 ? (
          <div className="text-slate-500 text-sm py-8 text-center">
            🎉 ¡No hay tareas críticas! Buen trabajo.
          </div>
        ) : (
          <div className="space-y-3">
            {criticalTasks.map((task) => (
              <div
                key={task.id}
                onClick={() => handleTaskClick(task)}
                className="bg-white border-l-4 border-red-500 rounded-lg p-4 hover:shadow-md hover:translate-y-[-1px] transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-red-600 font-bold text-sm">🔴 P5</span>
                    <h3 className="font-bold text-slate-900 text-base">{task.title}</h3>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600 mb-2">
                  {task.projects && (
                    <>
                      <div className="flex items-center gap-1">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: task.projects.color || '#94a3b8' }}
                        />
                        <span>📁 {task.projects.name}</span>
                      </div>
                      <span>•</span>
                    </>
                  )}
                  <span>{formatDate(task.due_date)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[task.status]}`}>
                    {statusLabels[task.status]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedTask && (
        <EditTaskModal
          task={selectedTask}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false)
            setSelectedTask(null)
          }}
          onTaskUpdate={handleTaskUpdate}
        />
      )}
    </>
  )
}
