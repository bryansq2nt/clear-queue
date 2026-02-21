'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Database } from '@/lib/supabase/types';
import KanbanBoard from '@/components/KanbanBoard';
import { AddTaskModal } from '@/components/AddTaskModal';
import { MutationErrorDialog } from '@/components/MutationErrorDialog';
import { useI18n } from '@/components/I18nProvider';

type Task = Database['public']['Tables']['tasks']['Row'];
type Project = Database['public']['Tables']['projects']['Row'];

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

interface ContextBoardClientProps {
  projectId: string;
  initialProject: Project;
  initialTasks: Task[];
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
  initialTasks,
  onRefresh,
}: ContextBoardClientProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>(() =>
    sortTasksByOrder(initialTasks)
  );
  const [selectedTab, setSelectedTab] = useState<Task['status']>('next');
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [errorDialog, setErrorDialog] = useState<ErrorDialogState | null>(null);

  const loadData = useCallback(() => {
    if (onRefresh) void onRefresh();
    else router.refresh();
  }, [onRefresh, router]);

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
    setTasks(sortTasksByOrder(newTasks));
  }, []);

  const handleTaskUpdated = useCallback((updatedTask: Task) => {
    setTasks((prev) =>
      sortTasksByOrder(
        prev.map((t) => (t.id === updatedTask.id ? updatedTask : t))
      )
    );
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
          setTasks((prev) =>
            sortTasksByOrder(
              prev.map((t) =>
                t.id === params.previousTask.id ? params.previousTask : t
              )
            )
          );
        },
      });
    },
    [t]
  );

  return (
    <>
      <div className="h-full">
        <KanbanBoard
          tasks={tasks}
          projects={[initialProject]}
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
            setTasks((prev) => sortTasksByOrder([...prev, createdTask]));
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
                setTasks((prev) => sortTasksByOrder([...prev, result.data!]));
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
