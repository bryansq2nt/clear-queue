'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Trash2, MoreVertical, Link2, Check } from 'lucide-react';
import { Database } from '@/lib/supabase/types';
import { getProjectsForSidebar } from '@/app/actions/projects';
import { GlobalHeader } from '@/components/GlobalHeader';
import {
  createTodoItemAction,
  toggleTodoItemAction,
  updateTodoItemAction,
  deleteTodoItemAction,
  renameTodoListAction,
  updateTodoListAction,
  deleteTodoListAction,
} from '@/app/todo/actions';
import type { TodoItem } from '@/lib/todo/lists';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useI18n } from '@/components/I18nProvider';

type Project = Database['public']['Tables']['projects']['Row'];

interface ListBoardClientProps {
  listId: string;
  initialListTitle: string;
  initialProjectId: string | null;
  initialProjectName: string | null;
  initialItems: TodoItem[];
}

export default function ListBoardClient({
  listId,
  initialListTitle,
  initialProjectId,
  initialProjectName,
  initialItems,
}: ListBoardClientProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [listTitle, setListTitle] = useState(initialListTitle);
  const [projectId, setProjectId] = useState<string | null>(initialProjectId);
  const [items, setItems] = useState<TodoItem[]>(initialItems);
  const [projects, setProjects] = useState<Project[]>([]);
  const [newTaskContent, setNewTaskContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(initialListTitle);
  const [savingTitle, setSavingTitle] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [deletingList, setDeletingList] = useState(false);
  const [linkProjectOpen, setLinkProjectOpen] = useState(false);
  const newTaskInputRef = useRef<HTMLInputElement>(null);

  const loadProjects = useCallback(async () => {
    const data = await getProjectsForSidebar();
    setProjects(data);
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    setListTitle(initialListTitle);
    setTitleValue(initialListTitle);
    setProjectId(initialProjectId);
  }, [initialListTitle, initialProjectId]);

  const submitNewTask = useCallback(
    (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      setError(null);
      const tempId = `opt-${Date.now()}`;
      const optimisticItem: TodoItem = {
        id: tempId,
        owner_id: '',
        list_id: listId,
        content: trimmed,
        is_done: false,
        due_date: null,
        position: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setItems((prev) => [...prev, optimisticItem]);
      setNewTaskContent('');
      newTaskInputRef.current?.focus();

      createTodoItemAction(
        (() => {
          const fd = new FormData();
          fd.append('list_id', listId);
          fd.append('content', trimmed);
          return fd;
        })()
      ).then((result) => {
        if (result.data) {
          setItems((prev) =>
            prev.map((i) => (i.id === tempId ? result.data! : i))
          );
          router.refresh();
        } else {
          setItems((prev) => prev.filter((i) => i.id !== tempId));
          setError(result.error ?? null);
        }
      });
    },
    [listId, router]
  );

  const handleNewTaskKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const content = newTaskContent.trim();
    if (!content) return;
    submitNewTask(content);
  };

  const handleToggle = async (item: TodoItem) => {
    if (item.id.startsWith('opt-')) return;
    const result = await toggleTodoItemAction(item.id);
    if (result.data) {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_done: !i.is_done } : i))
      );
      router.refresh();
    }
  };

  const handleUpdateContent = async (item: TodoItem, content: string) => {
    if (item.id.startsWith('opt-')) return;
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
    if (item.id.startsWith('opt-')) return;
    const result = await deleteTodoItemAction(item.id);
    if (result.success) {
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      router.refresh();
    }
  };

  const handleSaveTitle = async () => {
    const trimmed = titleValue.trim();
    if (!trimmed || trimmed === listTitle) {
      setEditingTitle(false);
      setTitleValue(listTitle);
      return;
    }
    setSavingTitle(true);
    const result = await renameTodoListAction(listId, trimmed);
    setSavingTitle(false);
    if (result.data) {
      setListTitle(trimmed);
      setEditingTitle(false);
      router.refresh();
    } else if (result.error) {
      setError(result.error);
    }
  };

  const handleProjectChange = async (newProjectId: string) => {
    const value = newProjectId === 'none' ? null : newProjectId;
    if (value === projectId) return;
    setSavingProject(true);
    const result = await updateTodoListAction(listId, { project_id: value });
    setSavingProject(false);
    if (result.data) {
      setProjectId(value);
      setLinkProjectOpen(false);
      router.refresh();
    } else if (result.error) {
      setError(result.error);
    }
  };

  const handleDeleteList = async () => {
    if (!confirm(t('todo.delete_list_confirm', { title: listTitle }))) return;
    setDeletingList(true);
    const result = await deleteTodoListAction(listId);
    setDeletingList(false);
    if (result.success) {
      router.push('/todo');
    } else if (result.error) {
      setError(result.error);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <GlobalHeader backHref="/todo" backLabel="" title={t('todo.title')} />
      <main className="flex-1 overflow-y-auto min-h-0 px-4 sm:px-6 py-4">
        <div className="max-w-5xl mx-auto w-full pb-24">
          {/* List title - only in content */}
          <div className="border-b border-border pb-4 mb-4">
            <div className="flex flex-wrap items-center gap-4">
              {editingTitle ? (
                <input
                  type="text"
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  onBlur={handleSaveTitle}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTitle();
                    if (e.key === 'Escape') {
                      setTitleValue(listTitle);
                      setEditingTitle(false);
                    }
                  }}
                  autoFocus
                  disabled={savingTitle}
                  className="text-xl font-semibold bg-transparent border-0 border-b border-slate-300 dark:border-gray-600 focus:outline-none focus:ring-0 py-0.5 text-slate-900 dark:text-white min-w-[200px]"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingTitle(true)}
                  className="text-xl font-semibold text-slate-900 dark:text-white truncate text-left hover:opacity-80"
                >
                  {listTitle}
                </button>
              )}
            </div>
          </div>

          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

          {/* Task list + new task row (Enter to add, no button) */}
          <div className="mt-6">
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
              <li className="flex items-center gap-3 py-3">
                <span
                  className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-slate-300 dark:border-gray-600 bg-transparent"
                  aria-hidden
                />
                <input
                  ref={newTaskInputRef}
                  type="text"
                  value={newTaskContent}
                  onChange={(e) => setNewTaskContent(e.target.value)}
                  onKeyDown={handleNewTaskKeyDown}
                  placeholder={t('todo.add_task_placeholder')}
                  className="flex-1 min-w-0 bg-transparent border-0 border-b border-slate-200 dark:border-gray-700 focus:border-slate-400 dark:focus:border-gray-500 focus:outline-none focus:ring-0 py-0.5 text-base text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  aria-label={t('todo.add_task_placeholder')}
                />
              </li>
            </ul>
          </div>
        </div>
      </main>

      {/* FAB: 3-dot menu — Link to project, Delete list */}
      <div className="fixed bottom-6 right-6 z-40 md:bottom-8 md:right-8">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
              aria-label={t('todo.title')}
            >
              <MoreVertical className="w-6 h-6" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-56">
            <DropdownMenuItem onClick={() => setLinkProjectOpen(true)}>
              <Link2 className="w-4 h-4 mr-2" />
              {t('todo.link_list_to_project')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleDeleteList}
              disabled={deletingList}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {t('todo.delete_list')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Modal: Link list to project */}
      <Dialog open={linkProjectOpen} onOpenChange={setLinkProjectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('todo.link_list_to_project')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Select
              value={projectId ?? 'none'}
              onValueChange={handleProjectChange}
              disabled={savingProject}
            >
              <SelectTrigger className="w-full h-10">
                <SelectValue placeholder={t('todo.no_project')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('todo.no_project')}</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </DialogContent>
      </Dialog>
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
