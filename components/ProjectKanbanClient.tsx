'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/lib/supabase/types';
import KanbanBoard from './KanbanBoard';
import TopBar from './TopBar';
import { ProjectResourcesPanel } from './ProjectResourcesPanel';
import { signOut } from '@/app/actions/auth';
import { useRouter } from 'next/navigation';
import { SelectionActionBar } from './SelectionActionBar';
import { AddTaskModal } from './AddTaskModal';
import { deleteTasksByIds } from '@/app/actions/tasks';
import { cn } from '@/lib/utils';
import {
  Plus,
  FolderOpen,
  CheckSquare,
  Pencil,
  MoreVertical,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { useI18n } from '@/components/I18nProvider';

type Project = Database['public']['Tables']['projects']['Row'];
type Task = Database['public']['Tables']['tasks']['Row'];

interface ProjectKanbanClientProps {
  projectId: string;
}

export default function ProjectKanbanClient({
  projectId,
}: ProjectKanbanClientProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(
    new Set()
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [resourcesPanelOpen, setResourcesPanelOpen] = useState(true);
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [resourcesModalOpen, setResourcesModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedKanbanTab, setSelectedKanbanTab] = useState<
    'backlog' | 'next' | 'in_progress' | 'blocked' | 'done'
  >('next');
  const router = useRouter();
  const { t } = useI18n();

  const supabase = createClient();

  // Selection mode helpers
  const toggleTaskSelection = useCallback((taskId: string) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedTaskIds(new Set());
    setSelectionMode(false);
  }, []);

  const enterSelectionMode = useCallback(() => {
    setSelectionMode(true);
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedTaskIds(new Set());
  }, []);

  // ESC key handler
  useEffect(() => {
    if (!selectionMode) return;

    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        exitSelectionMode();
      }
    }

    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [selectionMode, exitSelectionMode]);

  // Bulk delete handler
  async function handleBulkDelete() {
    if (selectedTaskIds.size === 0) return;

    setIsDeleting(true);
    const ids = Array.from(selectedTaskIds);

    // Optimistic update
    setTasks((prev) => prev.filter((t) => !ids.includes(t.id)));
    setSelectedTaskIds(new Set());
    setSelectionMode(false);

    const result = await deleteTasksByIds(ids);

    if (result.error) {
      // Revert on error
      loadData();
      alert('Failed to delete tasks: ' + result.error);
    } else {
      // Refresh data
      loadData();
    }

    setIsDeleting(false);
  }

  const loadData = useCallback(async () => {
    setLoading(true);

    const [projectsRes, projectRes, tasksRes] = await Promise.all([
      supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: true }),
      supabase.from('projects').select('*').eq('id', projectId).single(),
      supabase
        .from('tasks')
        .select('*')
        .eq('project_id', projectId)
        .order('order_index', { ascending: true }),
    ]);

    if (projectsRes?.data) setProjects(projectsRes.data as Project[]);
    const projectData = (projectRes as { data?: Project } | null)?.data;
    if (projectData) setCurrentProject(projectData);
    if (tasksRes?.data) setTasks(tasksRes.data as Task[]);

    setLoading(false);
  }, [supabase, projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredTasks = tasks.filter((task) => {
    if (
      searchQuery &&
      !task.title.toLowerCase().includes(searchQuery.toLowerCase())
    )
      return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Project not found</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <div className="flex-1 flex flex-col min-h-0">
        <TopBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSignOut={signOut}
          onProjectAdded={loadData}
          onProjectUpdated={loadData}
          projectName={currentProject.name}
          currentProject={currentProject}
          selectionMode={selectionMode}
          onToggleSelectionMode={() => {
            if (selectionMode) {
              exitSelectionMode();
            } else {
              enterSelectionMode();
            }
          }}
          resourcesInSidebar
          backHref="/projects"
          backLabel=""
          resourcesModalOpen={resourcesModalOpen}
          onResourcesModalOpenChange={setResourcesModalOpen}
          editModalOpen={editModalOpen}
          onEditModalOpenChange={setEditModalOpen}
        />
        <div className="flex-1 flex overflow-hidden">
          <div
            className={cn(
              'flex-1 overflow-x-auto',
              selectionMode && 'pb-20',
              'pb-20 lg:pb-0'
            )}
          >
            <KanbanBoard
              tasks={filteredTasks}
              projects={projects}
              onTaskUpdate={loadData}
              currentProjectId={projectId}
              selectionMode={selectionMode}
              selectedTaskIds={selectedTaskIds}
              onToggleSelection={toggleTaskSelection}
              selectedTab={selectedKanbanTab}
              onTabChange={setSelectedKanbanTab}
              onAddTask={() => setIsAddTaskOpen(true)}
            />
          </div>
          <div className="hidden lg:flex flex-shrink-0">
            {resourcesPanelOpen ? (
              <ProjectResourcesPanel
                projectId={projectId}
                projectName={currentProject.name}
                onCollapse={() => setResourcesPanelOpen(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setResourcesPanelOpen(true)}
                className="w-10 flex-shrink-0 bg-card border-l border-border flex flex-col items-center justify-center py-4 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                aria-label={t('resources.title')}
                title={t('resources.title')}
              >
                <FolderOpen className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
        {selectionMode && (
          <SelectionActionBar
            selectedCount={selectedTaskIds.size}
            onDelete={handleBulkDelete}
            onCancel={exitSelectionMode}
            isDeleting={isDeleting}
          />
        )}

        {!selectionMode && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t('common.menu')}
                className="fixed bottom-16 right-6 left-auto z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background lg:bottom-6"
              >
                <MoreVertical className="h-6 w-6" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="end"
              sideOffset={8}
              className="min-w-[12rem]"
            >
              <DropdownMenuItem onClick={() => setIsAddTaskOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                {t('kanban.add_task')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setResourcesModalOpen(true)}
                className="lg:hidden"
              >
                <FolderOpen className="mr-2 h-4 w-4" />
                {t('resources.title')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setEditModalOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                {t('topbar.edit_project')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => enterSelectionMode()}>
                <CheckSquare className="mr-2 h-4 w-4" />
                {t('topbar.select')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <AddTaskModal
          isOpen={isAddTaskOpen}
          onClose={() => setIsAddTaskOpen(false)}
          onTaskAdded={() => {
            loadData();
            setIsAddTaskOpen(false);
          }}
          defaultProjectId={projectId}
          defaultStatus={selectedKanbanTab}
        />
      </div>
    </div>
  );
}
