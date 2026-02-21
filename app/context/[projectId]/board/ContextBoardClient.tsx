'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Database } from '@/lib/supabase/types';
import KanbanBoard from '@/components/KanbanBoard';
import { AddTaskModal } from '@/components/AddTaskModal';
import { MutationErrorDialog } from '@/components/MutationErrorDialog';
import { useI18n } from '@/components/I18nProvider';
import { getTasksByProjectIdPaginated } from '@/app/actions/tasks';
import { BOARD_STATUSES, LOAD_MORE_TASKS_PER_COLUMN } from '@/lib/board';

type Task = Database['public']['Tables']['tasks']['Row'];
type Project = Database['public']['Tables']['projects']['Row'];
type TaskStatus = Task['status'];

type ErrorDialogState = {
  open: boolean;
  title: string;
  message: string;
  onTryAgain: () => void | Promise<void>;
  onCancel: () => void;
};

function sortTasksByOrder(a: Task[]): Task[] {
  return [...a].sort((x, y) => x.order_index - y.order_index);
}

function groupTasksByStatus(tasks: Task[]): Record<TaskStatus, Task[]> {
  const out = {} as Record<TaskStatus, Task[]>;
  for (const s of BOARD_STATUSES) {
    out[s] = [];
  }
  for (const t of tasks) {
    out[t.status].push(t);
  }
  for (const s of BOARD_STATUSES) {
    out[s] = sortTasksByOrder(out[s]);
  }
  return out;
}

interface ContextBoardClientProps {
  projectId: string;
  initialProject: Project;
  initialCounts: Record<TaskStatus, number>;
  initialTasksByStatus: Record<TaskStatus, Task[]>;
  /** When provided (context cache), used instead of router.refresh() */
  onRefresh?: () => void | Promise<void>;
}

/**
 * Kanban board for context view — no sidebar, no resources panel.
 * Owns tasks state; updates optimistically without refresh. Shows MutationErrorDialog on server errors.
 */
export default function ContextBoardClient({
  projectId,
  initialProject,
  initialCounts,
  initialTasksByStatus,
  onRefresh,
}: ContextBoardClientProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [tasksByStatus, setTasksByStatus] =
    useState<Record<TaskStatus, Task[]>>(initialTasksByStatus);
  const [counts, setCounts] =
    useState<Record<TaskStatus, number>>(initialCounts);
  const [loadingMore, setLoadingMore] = useState<TaskStatus | null>(null);
  const [selectedTab, setSelectedTab] = useState<TaskStatus>('next');
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [errorDialog, setErrorDialog] = useState<ErrorDialogState | null>(null);

  const flatTasks = useMemo(
    () => sortTasksByOrder(Object.values(tasksByStatus).flat()),
    [tasksByStatus]
  );

  const loadData = useCallback(() => {
    if (onRefresh) void onRefresh();
    else router.refresh();
  }, [onRefresh, router]);

  const loadMoreForStatus = useCallback(
    async (status: TaskStatus) => {
      const current = tasksByStatus[status];
      const offset = current.length;
      setLoadingMore(status);
      try {
        const more = await getTasksByProjectIdPaginated(
          projectId,
          status,
          offset,
          LOAD_MORE_TASKS_PER_COLUMN
        );
        setTasksByStatus((prev) => ({
          ...prev,
          [status]: sortTasksByOrder([...prev[status], ...more]),
        }));
      } finally {
        setLoadingMore(null);
      }
    },
    [projectId, tasksByStatus]
  );

  const openMoveErrorDialog = useCallback(
    (params: {
      message: string;
      performRetry: () => Promise<{ error?: string } | undefined>;
      performRevert: () => void;
    }) => {
      setErrorDialog({
        open: true,
        title: t('mutation_error.title'),
        message: params.message,
        onTryAgain: async () => {
          const result = await params.performRetry();
          if (result?.error) throw new Error(result.error);
        },
        onCancel: () => {
          params.performRevert();
        },
      });
    },
    [t]
  );

  const handleTasksChange = useCallback((newTasks: Task[]) => {
    setTasksByStatus(groupTasksByStatus(newTasks));
  }, []);

  const handleTaskUpdated = useCallback((updatedTask: Task) => {
    setTasksByStatus((prev) => {
      const next = { ...prev };
      for (const s of BOARD_STATUSES) {
        const idx = next[s].findIndex((t) => t.id === updatedTask.id);
        if (idx >= 0) {
          if (updatedTask.status === s) {
            next[s] = next[s].map((t) =>
              t.id === updatedTask.id ? updatedTask : t
            );
            next[s] = sortTasksByOrder(next[s]);
          } else {
            next[s] = next[s].filter((t) => t.id !== updatedTask.id);
            next[updatedTask.status] = sortTasksByOrder([
              ...next[updatedTask.status],
              updatedTask,
            ]);
            setCounts((c) => ({
              ...c,
              [s]: c[s] - 1,
              [updatedTask.status]: c[updatedTask.status] + 1,
            }));
          }
          return next;
        }
      }
      return prev;
    });
  }, []);

  const openEditErrorDialog = useCallback(
    (params: {
      message: string;
      previousTask: Task;
      retry: () => Promise<{ data?: Task; error?: string }>;
    }) => {
      setErrorDialog({
        open: true,
        title: t('mutation_error.title'),
        message: params.message,
        onTryAgain: async () => {
          const result = await params.retry();
          if (result?.error) throw new Error(result.error);
        },
        onCancel: () => {
          setTasksByStatus((prev) => {
            const s = params.previousTask.status;
            const next = { ...prev };
            next[s] = next[s].map((t) =>
              t.id === params.previousTask.id ? params.previousTask : t
            );
            next[s] = sortTasksByOrder(next[s]);
            return next;
          });
        },
      });
    },
    [t]
  );

  return (
    <>
      <div className="h-full">
        <KanbanBoard
          tasks={flatTasks}
          projects={[initialProject]}
          counts={counts}
          onLoadMore={loadMoreForStatus}
          loadingMoreStatus={loadingMore}
          onTaskUpdate={loadData}
          currentProjectId={projectId}
          selectedTab={selectedTab}
          onTabChange={setSelectedTab}
          onAddTask={() => setIsAddTaskOpen(true)}
          onTasksChange={handleTasksChange}
          onMoveError={openMoveErrorDialog}
          onTaskUpdated={handleTaskUpdated}
          onEditError={openEditErrorDialog}
          skipRevalidateOnMove
        />
      </div>
      <AddTaskModal
        isOpen={isAddTaskOpen}
        onClose={() => setIsAddTaskOpen(false)}
        onTaskAdded={(createdTask) => {
          if (createdTask) {
            const s = createdTask.status;
            setTasksByStatus((prev) => ({
              ...prev,
              [s]: sortTasksByOrder([...prev[s], createdTask]),
            }));
            setCounts((c) => ({ ...c, [s]: c[s] + 1 }));
          }
          setIsAddTaskOpen(false);
        }}
        onAddError={(params) => {
          setErrorDialog({
            open: true,
            title: t('mutation_error.title'),
            message: params.message,
            onTryAgain: async () => {
              const result = await params.retry();
              if (result?.error) throw new Error(result.error);
              if (result?.data) {
                const s = result.data.status;
                setTasksByStatus((prev) => ({
                  ...prev,
                  [s]: sortTasksByOrder([...prev[s], result.data!]),
                }));
                setCounts((c) => ({ ...c, [s]: c[s] + 1 }));
                setIsAddTaskOpen(false);
              }
            },
            onCancel: () => {},
          });
        }}
        defaultProjectId={projectId}
        defaultStatus={selectedTab}
      />
      {errorDialog && (
        <MutationErrorDialog
          open={errorDialog.open}
          onOpenChange={(open) => {
            if (!open) {
              errorDialog.onCancel();
              setErrorDialog(null);
            }
          }}
          title={errorDialog.title}
          message={errorDialog.message}
          onTryAgain={errorDialog.onTryAgain}
          onCancel={errorDialog.onCancel}
        />
      )}
    </>
  );
}
