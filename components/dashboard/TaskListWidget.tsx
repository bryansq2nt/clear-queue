'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/types'
import { EditTaskModal } from '../EditTaskModal'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

type Task = Database['public']['Tables']['tasks']['Row']
type Project = Database['public']['Tables']['projects']['Row']

interface TaskWithProject extends Task {
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
  backlog: "bg-muted text-muted-foreground",
  next: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400",
  in_progress: "bg-blue-500/20 text-blue-700 dark:text-blue-400",
  blocked: "bg-red-500/20 text-red-700 dark:text-red-400",
  done: "bg-green-500/20 text-green-700 dark:text-green-400",
} as const

function formatDate(dateString: string | null): string {
  if (!dateString) return ""
  const date = new Date(dateString)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${month}/${day}/${year}`
}

function formatRelativeDate(dateString: string | null): string {
  if (!dateString) return ""
  const date = new Date(dateString)
  const now = new Date()
  
  // Reset time to compare only dates
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const nowOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  
  const diffMs = nowOnly.getTime() - dateOnly.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) return "Hoy"
  if (diffDays === 1) return "Ayer"
  if (diffDays < 7) return `Hace ${diffDays}d`
  if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} sem`
  
  return formatDate(dateString)
}

interface TaskListWidgetProps {
  title: string
  viewAllLink: string
  queryFn: (page: number, pageSize: number) => Promise<{ data: TaskWithProject[] | null; count: number | null; error: any }>
  emptyMessage: string
  showUpdatedAt?: boolean
  borderColor?: string
  bgColor?: string
}

export default function TaskListWidget({
  title,
  viewAllLink,
  queryFn,
  emptyMessage,
  showUpdatedAt = false,
  borderColor = "border-blue-500",
  bgColor = "bg-blue-50",
}: TaskListWidgetProps) {
  const [tasks, setTasks] = useState<TaskWithProject[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const pageSize = 6

  const loadTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await queryFn(page, pageSize)
    
    if (result.error) {
      setError(result.error.message || 'Error al cargar tareas')
      setLoading(false)
      return
    }

    // Transform the data to flatten the projects relation
    const transformedTasks = (result.data || []).map((task: any) => {
      let project: Project | null = null
      if (task.projects) {
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
    }) as TaskWithProject[]

    setTasks(transformedTasks)
    setTotalCount(result.count || 0)
    setLoading(false)
  }, [page, pageSize, queryFn])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  function handleTaskClick(task: Task) {
    setSelectedTask(task)
    setIsModalOpen(true)
  }

  function handleTaskUpdate() {
    loadTasks()
  }

  const totalPages = Math.ceil(totalCount / pageSize)
  const startItem = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const endItem = Math.min(page * pageSize, totalCount)

  return (
    <>
      <div className="bg-card rounded-lg shadow p-6 hover:shadow-lg transition-shadow border border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-foreground">{title}</h2>
          <Link
            href={viewAllLink}
            className="text-primary hover:text-primary/90 text-sm font-medium transition-colors"
          >
            Ver todas →
          </Link>
        </div>

        {loading ? (
          <div className="text-muted-foreground text-sm py-4">Cargando...</div>
        ) : error ? (
          <div className="text-destructive text-sm py-4">{error}</div>
        ) : tasks.length === 0 ? (
          <div className="text-muted-foreground text-sm py-4">{emptyMessage}</div>
        ) : (
          <>
            <div className="space-y-3">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => handleTaskClick(task)}
                  className={`border-l-4 ${borderColor} ${bgColor} rounded-r-lg p-4 hover:opacity-90 transition-colors cursor-pointer`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-medium text-foreground flex-1">{task.title}</h3>
                    {showUpdatedAt && task.updated_at ? (
                      <span className="text-slate-600 text-sm ml-2 whitespace-nowrap">
                        {formatRelativeDate(task.updated_at)}
                      </span>
                    ) : task.due_date ? (
                      <span className="text-muted-foreground text-sm ml-2 whitespace-nowrap">
                        {formatDate(task.due_date)}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {task.projects && (
                      <>
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: task.projects.color || '#94a3b8' }}
                        />
                        <span>{task.projects.name}</span>
                      </>
                    )}
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ml-auto ${statusColors[task.status]}`}>
                      {statusLabels[task.status]}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Mostrando {startItem}–{endItem} de {totalCount}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 text-sm font-medium text-foreground bg-card border border-border rounded-md hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Anterior
                  </button>
                  <span className="text-sm text-muted-foreground px-2">
                    Página {page} de {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 text-sm font-medium text-foreground bg-card border border-border rounded-md hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    Siguiente
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
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
