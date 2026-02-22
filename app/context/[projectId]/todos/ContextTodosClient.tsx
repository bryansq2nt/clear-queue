'use client';

import { useState, useEffect } from 'react';
import { Plus, Check, Trash2 } from 'lucide-react';
import type { TodoItem } from '@/lib/todo/lists';
import { cn } from '@/lib/utils';
import { useI18n } from '@/components/shared/I18nProvider';
import { useProjectTodoBoard } from './hooks/useProjectTodoBoard';

interface ContextTodosClientProps {
  projectId: string;
  initialProjectName: string;
  initialDefaultListId: string;
  initialItems: TodoItem[];
  onRefresh?: () => void | Promise<void>;
}

/**
 * To-dos tab for context view — project-scoped task list.
 * Reuses useProjectTodoBoard and same task list UI as ProjectBoardClient, without sidebar/topbar.
 */
export default function ContextTodosClient({
  initialProjectName,
  initialDefaultListId,
  initialItems,
  onRefresh,
}: ContextTodosClientProps) {
  const { t } = useI18n();
  const [projectName] = useState(initialProjectName);
  const { items, error, createItem, toggleItem, updateItem, deleteItem } =
    useProjectTodoBoard({
      defaultListId: initialDefaultListId,
      initialItems,
    });

  const [newTaskContent, setNewTaskContent] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = newTaskContent.trim();
    if (!content || !initialDefaultListId) return;

    setAdding(true);
    await createItem(content);
    setAdding(false);
    setNewTaskContent('');
    onRefresh?.();
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl">
      <h2 className="text-lg font-semibold text-foreground mb-4">
        {projectName}
      </h2>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      <form onSubmit={handleAddTask} className="mb-6">
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={newTaskContent}
            onChange={(e) => setNewTaskContent(e.target.value)}
            placeholder={t('todo.add_task_placeholder')}
            disabled={adding}
            className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={adding || !newTaskContent.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {t('common.add')}
          </button>
        </div>
      </form>

      <div>
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8">
            {t('todo.no_tasks_yet')}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <TaskRow
                key={item.id}
                item={item}
                onToggle={async () => {
                  await toggleItem(item);
                  onRefresh?.();
                }}
                onSaveContent={async (content) => {
                  await updateItem(item, content);
                  onRefresh?.();
                }}
                onDelete={async () => {
                  await deleteItem(item);
                  onRefresh?.();
                }}
              />
            ))}
          </ul>
        )}
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
  const { t } = useI18n();
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
        <span className="w-5 h-5 rounded-full border-2 border-border bg-transparent flex items-center justify-center transition-colors peer-checked:bg-primary peer-checked:border-primary">
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
            className="w-full bg-transparent border-0 border-b border-border focus:border-primary focus:outline-none focus:ring-0 py-0.5 text-base text-foreground"
          />
        ) : (
          <span
            onClick={() => setEditing(true)}
            className={cn(
              'cursor-text text-base leading-relaxed',
              item.is_done
                ? 'text-muted-foreground line-through'
                : 'text-foreground'
            )}
          >
            {item.content}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-destructive transition-opacity"
        title={t('common.delete')}
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </li>
  );
}
