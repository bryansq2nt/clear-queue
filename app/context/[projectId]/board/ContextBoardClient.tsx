'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Database } from '@/lib/supabase/types';
import KanbanBoard from '@/components/board/KanbanBoard';
import { AddTaskModal } from '@/components/board/AddTaskModal';
import { MutationErrorDialog } from '@/components/board/MutationErrorDialog';
import { useI18n } from '@/components/shared/I18nProvider';
import { getTasksByProjectIdPaginated } from '@/app/actions/tasks';
import { BOARD_STATUSES, LOAD_MORE_TASKS_PER_COLUMN } from '@/lib/board';
import { Plus } from 'lucide-react';

type Task = Database['public']['Tables']['tasks']['Row'];
type Project = Database['public']['Tables']['projects']['Row'];
type TaskStatus = Task['status'];

type ErrorDialogState = {
  open: boolean;
  title: string;
  message: string;
  onTryAgain: () => void | Promise<void>;
  onCancel: () => void;
  /** When set, cancel should remove this optimistic task from the board */
  optimisticId?: string;
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
          onTaskAdded={(task) => {
            const s = task.status;
            setTasksByStatus((prev) => ({
              ...prev,
              [s]: sortTasksByOrder([...prev[s], task]),
            }));
            setCounts((c) => ({ ...c, [s]: c[s] + 1 }));
          }}
          onTaskConfirmed={(realTask, optimisticId) => {
            setTasksByStatus((prev) => {
              const next = { ...prev };
              const s = realTask.status;
              for (const status of BOARD_STATUSES) {
                const idx = next[status].findIndex(
                  (t) => t.id === optimisticId
                );
                if (idx >= 0) {
                  next[status] = next[status]
                    .filter((t) => t.id !== optimisticId)
                    .concat(realTask);
                  next[status] = sortTasksByOrder(next[status]);
                  return next;
                }
              }
              return prev;
            });
          }}
          onAddTaskError={(params) => {
            setErrorDialog({
              open: true,
              title: t('mutation_error.title'),
              message: params.message,
              optimisticId: params.optimisticId,
              onTryAgain: async () => {
                const result = await params.retry();
                if (result?.error) throw new Error(result.error);
                if (result?.data && params.optimisticId) {
                  setTasksByStatus((prev) => {
                    const next = { ...prev };
                    const s = result.data!.status;
                    const id = params.optimisticId!;
                    for (const status of BOARD_STATUSES) {
                      const idx = next[status].findIndex((t) => t.id === id);
                      if (idx >= 0) {
                        next[status] = next[status]
                          .filter((t) => t.id !== id)
                          .concat(result.data!);
                        next[status] = sortTasksByOrder(next[status]);
                        return next;
                      }
                    }
                    return prev;
                  });
                }
              },
              onCancel: () => {
                if (params.optimisticId) {
                  const id = params.optimisticId;
                  let removedStatus: TaskStatus | null = null;
                  setTasksByStatus((prev) => {
                    const next = { ...prev };
                    for (const status of BOARD_STATUSES) {
                      if (next[status].some((t) => t.id === id)) {
                        next[status] = next[status].filter((t) => t.id !== id);
                        next[status] = sortTasksByOrder(next[status]);
                        removedStatus = status;
                        break;
                      }
                    }
                    return next;
                  });
                  if (removedStatus !== null) {
                    setCounts((c) => ({
                      ...c,
                      [removedStatus!]: c[removedStatus!] - 1,
                    }));
                  }
                }
              },
            });
          }}
        />
      </div>
      <AddTaskModal
        isOpen={isAddTaskOpen}
        onClose={() => setIsAddTaskOpen(false)}
        onTaskAdded={(createdTask) => {
          const s = createdTask.status;
          setTasksByStatus((prev) => ({
            ...prev,
            [s]: sortTasksByOrder([...prev[s], createdTask]),
          }));
          setCounts((c) => ({ ...c, [s]: c[s] + 1 }));
          setIsAddTaskOpen(false);
        }}
        onTaskConfirmed={(realTask, optimisticId) => {
          setTasksByStatus((prev) => {
            const next = { ...prev };
            const s = realTask.status;
            for (const status of BOARD_STATUSES) {
              const idx = next[status].findIndex((t) => t.id === optimisticId);
              if (idx >= 0) {
                next[status] = next[status]
                  .filter((t) => t.id !== optimisticId)
                  .concat(realTask);
                next[status] = sortTasksByOrder(next[status]);
                return next;
              }
            }
            return prev;
          });
        }}
        onAddError={(params) => {
          setErrorDialog({
            open: true,
            title: t('mutation_error.title'),
            message: params.message,
            optimisticId: params.optimisticId,
            onTryAgain: async () => {
              const result = await params.retry();
              if (result?.error) throw new Error(result.error);
              if (result?.data && params.optimisticId) {
                setTasksByStatus((prev) => {
                  const next = { ...prev };
                  const s = result.data!.status;
                  const id = params.optimisticId!;
                  for (const status of BOARD_STATUSES) {
                    const idx = next[status].findIndex((t) => t.id === id);
                    if (idx >= 0) {
                      next[status] = next[status]
                        .filter((t) => t.id !== id)
                        .concat(result.data!);
                      next[status] = sortTasksByOrder(next[status]);
                      return next;
                    }
                  }
                  return prev;
                });
              }
            },
            onCancel: () => {
              if (params.optimisticId) {
                const id = params.optimisticId;
                let removedStatus: TaskStatus | null = null;
                setTasksByStatus((prev) => {
                  const next = { ...prev };
                  for (const status of BOARD_STATUSES) {
                    if (next[status].some((t) => t.id === id)) {
                      next[status] = next[status].filter((t) => t.id !== id);
                      next[status] = sortTasksByOrder(next[status]);
                      removedStatus = status;
                      break;
                    }
                  }
                  return next;
                });
                if (removedStatus !== null) {
                  setCounts((c) => ({
                    ...c,
                    [removedStatus!]: c[removedStatus!] - 1,
                  }));
                }
              }
            },
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
      {/* FAB: Add task — mobile only; desktop uses per-column add at top */}
      <button
        type="button"
        onClick={() => setIsAddTaskOpen(true)}
        aria-label={t('tasks.add_task')}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background md:bottom-8 md:right-8 lg:hidden"
      >
        <Plus className="h-6 w-6" />
      </button>
    </>
  );
}
