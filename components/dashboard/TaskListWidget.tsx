'use client';

import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { Database } from '@/lib/supabase/types';
import { EditTaskModal } from '../EditTaskModal';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type Task = Database['public']['Tables']['tasks']['Row'];
type ProjectSummary = { id: string; name: string; color: string | null } | null;

interface TaskWithProject extends Task {
  projects: ProjectSummary;
}

const STATUS_KEYS = {
  backlog: 'task_status.backlog',
  next: 'task_status.next',
  in_progress: 'task_status.in_progress',
  blocked: 'task_status.blocked',
  done: 'task_status.done',
} as const;

const statusColors = {
  backlog: 'bg-muted text-muted-foreground',
  next: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  in_progress: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
  blocked: 'bg-red-500/20 text-red-700 dark:text-red-400',
  done: 'bg-green-500/20 text-green-700 dark:text-green-400',
} as const;

function formatDate(dateString: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(
    date.getDate()
  ).padStart(2, '0')}/${date.getFullYear()}`;
}

interface TaskListWidgetProps {
  title: string;
  viewAllLink: string;
  queryFn: (
    page: number,
    pageSize: number
  ) => Promise<{
    data: TaskWithProject[] | null;
    count: number | null;
    error: any;
  }>;
  emptyMessage: string;
  showUpdatedAt?: boolean;
  borderColor?: string;
  bgColor?: string;
}

export default function TaskListWidget({
  title,
  viewAllLink,
  queryFn,
  emptyMessage,
  showUpdatedAt = false,
  borderColor = 'border-blue-500',
  bgColor = 'bg-blue-50',
}: TaskListWidgetProps) {
  const { t } = useI18n();
  const [tasks, setTasks] = useState<TaskWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const pageSize = 6;

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await queryFn(page, pageSize);
    if (result.error) {
      setError(result.error.message || t('tasks.load_error'));
      setLoading(false);
      return;
    }
    const transformedTasks = (result.data || []).map((task: any) => ({
      ...task,
      projects: Array.isArray(task.projects)
        ? (task.projects[0] ?? null)
        : (task.projects ?? null),
    })) as TaskWithProject[];
    setTasks(transformedTasks);
    setTotalCount(result.count || 0);
    setLoading(false);
  }, [page, pageSize, queryFn, t]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const totalPages = Math.ceil(totalCount / pageSize);

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
          <div className="text-muted-foreground text-sm py-4">
            {t('common.loading')}
          </div>
        ) : error ? (
          <div className="text-destructive text-sm py-4">{error}</div>
        ) : tasks.length === 0 ? (
          <div className="text-muted-foreground text-sm py-4">
            {emptyMessage}
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => {
                  setSelectedTask(task);
                  setIsModalOpen(true);
                }}
                aria-label={`Open task ${task.title}`}
                className={`w-full text-left border-l-4 ${borderColor} ${bgColor} rounded-r-lg p-4 hover:opacity-90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-medium text-foreground flex-1">
                    {task.title}
                  </h3>
                  {showUpdatedAt && task.updated_at ? (
                    <span className="text-muted-foreground text-sm ml-2 whitespace-nowrap">
                      {formatDate(task.updated_at)}
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
                        style={{
                          backgroundColor:
                            task.projects.color ||
                            'hsl(var(--muted-foreground))',
                        }}
                      />
                      <span>{task.projects.name}</span>
                    </>
                  )}
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ml-auto ${statusColors[task.status]}`}
                  >
                    {t(STATUS_KEYS[task.status])}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {t('tasks.page')} {page} {t('tasks.of')} {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm font-medium text-foreground bg-card border border-border rounded-md hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" /> Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-sm font-medium text-foreground bg-card border border-border rounded-md hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              >
                {t('tasks.next')} <ChevronRight className="w-4 h-4" />
              </button>
            </div>
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
          onTaskUpdate={loadTasks}
        />
      )}
    </>
  );
}
