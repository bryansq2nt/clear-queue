'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, Check } from 'lucide-react';
import { Database } from '@/lib/supabase/types';
import { getProjectsForSidebar } from '@/app/actions/projects';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import { signOut } from '@/app/actions/auth';
import {
  createTodoItemAction,
  toggleTodoItemAction,
  updateTodoItemAction,
  deleteTodoItemAction,
} from '@/app/todo/actions';
import type { TodoItem } from '@/lib/todo/lists';
import { cn } from '@/lib/utils';
import { useI18n } from '@/components/I18nProvider';

type Project = Database['public']['Tables']['projects']['Row'];

interface ProjectBoardClientProps {
  projectId: string;
  initialProjectName: string;
  initialDefaultListId: string;
  initialItems: TodoItem[];
}

export default function ProjectBoardClient({
  projectId,
  initialProjectName,
  initialDefaultListId,
  initialItems,
}: ProjectBoardClientProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [projectName, setProjectName] = useState(initialProjectName);
  const [defaultListId, setDefaultListId] = useState(initialDefaultListId);
  const [items, setItems] = useState<TodoItem[]>(initialItems);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [newTaskContent, setNewTaskContent] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    const data = await getProjectsForSidebar();
    setProjects(data);
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = newTaskContent.trim();
    if (!content || !defaultListId) return;

    setError(null);
    setAdding(true);
    const formData = new FormData();
    formData.append('list_id', defaultListId);
    formData.append('content', content);
    const result = await createTodoItemAction(formData);
    setAdding(false);
    setNewTaskContent('');

    if (result.data) {
      setItems((prev) => [...prev, result.data!]);
      router.refresh();
    } else if (result.error) {
      setError(result.error);
    }
  };

  const handleToggle = async (item: TodoItem) => {
    const result = await toggleTodoItemAction(item.id);
    if (result.data) {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_done: !i.is_done } : i))
      );
      router.refresh();
    }
  };

  const handleUpdateContent = async (item: TodoItem, content: string) => {
    const trimmed = content.trim();
    if (trimmed === item.content) return;
    if (!trimmed) return;

    const result = await updateTodoItemAction(item.id, { content: trimmed });
    if (result.data) {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, content: trimmed } : i))
      );
      router.refresh();
    }
  };

  const handleDelete = async (item: TodoItem) => {
    const result = await deleteTodoItemAction(item.id);
    if (result.success) {
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      router.refresh();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <TopBar
        searchQuery=""
        onSearchChange={() => {}}
        onSignOut={() => signOut()}
        onProjectAdded={loadProjects}
        onProjectUpdated={loadProjects}
        projectName={projectName}
        currentProject={null}
        onOpenSidebar={() => setSidebarOpen(true)}
        minimal
        showSidebarButtonAlways
      />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          projects={projects}
          selectedProject={null}
          selectedCategory={null}
          showArchived={false}
          onSelectProject={() => {}}
          onCategoryChange={() => {}}
          onShowArchivedChange={() => {}}
          onProjectUpdated={loadProjects}
          mobileOpen={sidebarOpen}
          onMobileClose={() => setSidebarOpen(false)}
          overlayOnly
        />
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto w-full px-6 py-6">
            {/* Sticky header */}
            <div className="sticky top-0 z-10 -mx-6 px-6 py-3 bg-background/95 backdrop-blur border-b border-border flex flex-wrap items-center gap-3">
              <Link
                href="/todo"
                className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <ArrowLeft className="w-4 h-4" />
                {t('todo.back_to_todo')}
              </Link>
              <h1 className="text-xl font-semibold text-slate-900 dark:text-white truncate flex-1 min-w-0">
                {projectName}
              </h1>
            </div>

            {error && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}

            {/* Inline add task at top */}
            <form onSubmit={handleAddTask} className="mt-6">
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={newTaskContent}
                  onChange={(e) => setNewTaskContent(e.target.value)}
                  placeholder="Add a task..."
                  disabled={adding}
                  className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-base text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-gray-600"
                />
                <button
                  type="submit"
                  disabled={adding || !newTaskContent.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  Add
                </button>
              </div>
            </form>

            {/* Checklist */}
            <div className="mt-6">
              {items.length === 0 ? (
                <p className="text-slate-500 dark:text-slate-400 text-sm py-8">
                  No tasks yet. Add one above.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-gray-800">
                  {items.map((item) => (
                    <TaskRow
                      key={item.id}
                      item={item}
                      onToggle={() => handleToggle(item)}
                      onSaveContent={(content) =>
                        handleUpdateContent(item, content)
                      }
                      onDelete={() => handleDelete(item)}
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskRow({
  item,
  onToggle,
  onSaveContent,
  onDelete,
}: {
  item: TodoItem;
  onToggle: () => void;
  onSaveContent: (content: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(item.content);

  useEffect(() => {
    setValue(item.content);
  }, [item.content]);

  const handleBlur = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== item.content) onSaveContent(trimmed);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleBlur();
    }
    if (e.key === 'Escape') {
      setValue(item.content);
      setEditing(false);
    }
  };

  return (
    <li className="group flex items-center gap-3 py-3">
      <label className="flex-shrink-0 cursor-pointer flex items-center justify-center w-5 h-5">
        <input
          type="checkbox"
          checked={item.is_done}
          onChange={onToggle}
          className="sr-only peer"
        />
        <span className="w-5 h-5 rounded-full border-2 border-slate-300 dark:border-gray-600 bg-transparent flex items-center justify-center transition-colors peer-checked:bg-primary peer-checked:border-primary">
          {item.is_done && (
            <Check
              className="w-3 h-3 text-primary-foreground"
              strokeWidth={3}
            />
          )}
        </span>
      </label>
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            autoFocus
            className="w-full bg-transparent border-0 border-b border-slate-200 dark:border-gray-700 focus:border-slate-400 dark:focus:border-gray-500 focus:outline-none focus:ring-0 py-0.5 text-base text-slate-900 dark:text-white"
          />
        ) : (
          <span
            onClick={() => setEditing(true)}
            className={cn(
              'cursor-text text-base leading-relaxed',
              item.is_done
                ? 'text-slate-400 dark:text-slate-500 line-through'
                : 'text-slate-900 dark:text-white'
            )}
          >
            {item.content}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-slate-100 dark:hover:bg-gray-800 text-slate-400 hover:text-red-600 transition-opacity"
        title="Delete task"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </li>
  );
}
