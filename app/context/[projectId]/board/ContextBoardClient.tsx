'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Database } from '@/lib/supabase/types';
import KanbanBoard from '@/components/KanbanBoard';
import { AddTaskModal } from '@/components/AddTaskModal';

type Task = Database['public']['Tables']['tasks']['Row'];
type Project = Database['public']['Tables']['projects']['Row'];

interface ContextBoardClientProps {
  projectId: string;
  initialProject: Project;
  initialTasks: Task[];
  /** When provided (context cache), used instead of router.refresh() */
  onRefresh?: () => void | Promise<void>;
}

/**
 * Kanban board for context view — no sidebar, no resources panel.
 * Reuses KanbanBoard with project-scoped tasks.
 */
export default function ContextBoardClient({
  projectId,
  initialProject,
  initialTasks,
  onRefresh,
}: ContextBoardClientProps) {
  const router = useRouter();
  const [selectedTab, setSelectedTab] = useState<Task['status']>('next');
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);

  const loadData = () => {
    if (onRefresh) void onRefresh();
    else router.refresh();
  };

  return (
    <>
      <div className="h-full">
        <KanbanBoard
          tasks={initialTasks}
          projects={[initialProject]}
          onTaskUpdate={loadData}
          currentProjectId={projectId}
          selectedTab={selectedTab}
          onTabChange={setSelectedTab}
          onAddTask={() => setIsAddTaskOpen(true)}
        />
      </div>
      <AddTaskModal
        isOpen={isAddTaskOpen}
        onClose={() => setIsAddTaskOpen(false)}
        onTaskAdded={() => {
          loadData();
          setIsAddTaskOpen(false);
        }}
        defaultProjectId={projectId}
        defaultStatus={selectedTab}
      />
    </>
  );
}
