'use client';

import { useState, useEffect, useCallback } from 'react';
import { Database } from '@/lib/supabase/types';
import { getCriticalTasks } from '@/app/actions/tasks';
import { EditTaskModal } from '../EditTaskModal';
import Link from 'next/link';

type Task = Database['public']['Tables']['tasks']['Row'];
type Project = Database['public']['Tables']['projects']['Row'];

interface CriticalTask extends Task {
  projects: Project | null;
}

const statusLabels = {
  backlog: 'Pendientes',
  next: 'Lo Siguiente',
  in_progress: 'En Progreso',
  blocked: 'Bloqueado',
  done: 'Terminado',
} as const;

const statusColors = {
  backlog: 'bg-muted text-muted-foreground',
  next: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  in_progress: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
  blocked: 'bg-red-500/20 text-red-700 dark:text-red-400',
  done: 'bg-green-500/20 text-green-700 dark:text-green-400',
} as const;

function formatDate(dateString: string | null): string {
  if (!dateString) return '📅 Sin fecha';
  const date = new Date(dateString);
  return `📅 ${String(date.getDate()).padStart(2, '0')}/${String(
    date.getMonth() + 1
  ).padStart(2, '0')}/${date.getFullYear()}`;
}

export default function CriticalTasksWidget() {
  const [criticalTasks, setCriticalTasks] = useState<CriticalTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadCriticalTasks = useCallback(async () => {
    setLoading(true);
    const data = await getCriticalTasks();
    setCriticalTasks(
      (data || []).map((task: any) => ({
        ...task,
        projects: Array.isArray(task.projects)
          ? (task.projects[0] ?? null)
          : (task.projects ?? null),
      })) as CriticalTask[]
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    loadCriticalTasks();
  }, [loadCriticalTasks]);

  if (loading) {
    return (
      <div className="bg-card rounded-xl shadow p-5 border border-border">
        <div className="text-muted-foreground">Cargando tareas críticas...</div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-card rounded-xl shadow p-5 border border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-foreground">
            🎯 Mis Tareas Críticas
          </h2>
          <Link
            href="/dashboard"
            className="text-primary hover:text-primary/90 text-sm font-medium transition-colors"
          >
            Ver todas →
          </Link>
        </div>

        {criticalTasks.length === 0 ? (
          <div className="text-muted-foreground text-sm py-8 text-center">
            🎉 ¡No hay tareas críticas! Buen trabajo.
          </div>
        ) : (
          <div className="space-y-3">
            {criticalTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => {
                  setSelectedTask(task);
                  setIsModalOpen(true);
                }}
                aria-label={`Open critical task ${task.title}`}
                className="w-full text-left bg-card border-l-4 border-red-500 rounded-lg p-4 hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-red-600 font-bold text-sm">🔴 P5</span>
                  <h3 className="font-bold text-foreground text-base">
                    {task.title}
                  </h3>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground mb-2">
                  {task.projects && <span>📁 {task.projects.name}</span>}
                  <span>•</span>
                  <span>{formatDate(task.due_date)}</span>
                </div>
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[task.status]}`}
                >
                  {statusLabels[task.status]}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedTask && (
        <EditTaskModal
          task={selectedTask}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedTask(null);
          }}
          onTaskUpdate={loadCriticalTasks}
        />
      )}
    </>
  );
}
