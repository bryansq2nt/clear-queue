'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/components/I18nProvider';
import { Plus, List, Trash2, Archive, ArchiveRestore } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TodoList } from '@/lib/todo/lists';
import {
  createTodoListAction,
  deleteTodoListAction,
  archiveTodoListAction,
} from '@/app/todo/actions';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/lib/supabase/types';

type Project = Database['public']['Tables']['projects']['Row'];

interface TodoListsPanelProps {
  lists: TodoList[];
  selectedListId: string | null;
  onSelectList: (listId: string | null) => void;
  onRefresh: () => void;
  showArchived: boolean;
  onShowArchivedChange: (show: boolean) => void;
}

export default function TodoListsPanel({
  lists,
  selectedListId,
  onSelectList,
  onRefresh,
  showArchived,
  onShowArchivedChange,
}: TodoListsPanelProps) {
  const { t } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newListTitle, setNewListTitle] = useState('');
  const supabase = createClient();

  // Load projects
  useEffect(() => {
    supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) setProjects(data);
      });
  }, [supabase]);

  // Group lists by project
  const unassignedLists = lists.filter((l) => !l.project_id && !l.is_archived);
  const archivedLists = lists.filter((l) => l.is_archived);

  const listsByProject = projects.reduce(
    (acc, project) => {
      const projectLists = lists.filter(
        (l) => l.project_id === project.id && !l.is_archived
      );
      if (projectLists.length > 0) {
        acc[project.id] = { project, lists: projectLists };
      }
      return acc;
    },
    {} as Record<string, { project: Project; lists: TodoList[] }>
  );

  const handleCreateList = async () => {
    if (!newListTitle.trim()) return;

    setCreating(true);
    const formData = new FormData();
    formData.append('title', newListTitle);
    const result = await createTodoListAction(formData);
    setCreating(false);
    setNewListTitle('');

    if (result.data) {
      onRefresh();
    } else if (result.error) {
      alert(result.error);
    }
  };

  const handleDelete = async (listId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(listId);
    const result = await deleteTodoListAction(listId);
    setDeletingId(null);

    if (result.success) {
      if (selectedListId === listId) {
        onSelectList(null);
      }
      onRefresh();
    } else if (result.error) {
      alert(result.error);
    }
  };

  const handleArchive = async (
    listId: string,
    isArchived: boolean,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    const result = await archiveTodoListAction(listId, isArchived);
    if (result.data) {
      if (selectedListId === listId && isArchived) {
        onSelectList(null);
      }
      onRefresh();
    } else if (result.error) {
      alert(result.error);
    }
  };

  return (
    <div className="w-64 bg-white border-r border-slate-200 flex flex-col overflow-y-auto">
      <div className="p-4 space-y-4 flex-1">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
            Lists
          </h3>
        </div>

        {/* New List Input */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={newListTitle}
              onChange={(e) => setNewListTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreateList();
                }
              }}
              placeholder="New list..."
              className="flex-1 px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
            <Button
              onClick={handleCreateList}
              disabled={creating || !newListTitle.trim()}
              size="sm"
              className="px-3"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Archived Toggle */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="showArchived"
            checked={showArchived}
            onChange={(e) => onShowArchivedChange(e.target.checked)}
            className="w-4 h-4"
          />
          <label
            htmlFor="showArchived"
            className="text-sm text-slate-600 cursor-pointer"
          >
            Show archived
          </label>
        </div>

        <div className="space-y-4">
          {/* Unassigned Lists */}
          {unassignedLists.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 px-2">
                Unassigned
              </h4>
              <div className="space-y-1">
                {unassignedLists.map((list) => (
                  <ListRow
                    key={list.id}
                    list={list}
                    isSelected={selectedListId === list.id}
                    onSelect={() => onSelectList(list.id)}
                    onDelete={(e) => handleDelete(list.id, e)}
                    onArchive={(e) => handleArchive(list.id, true, e)}
                    deleting={deletingId === list.id}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Lists by Project */}
          {Object.values(listsByProject).map(
            ({ project, lists: projectLists }) => (
              <div key={project.id}>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 px-2">
                  {project.name}
                </h4>
                <div className="space-y-1">
                  {projectLists.map((list) => (
                    <ListRow
                      key={list.id}
                      list={list}
                      isSelected={selectedListId === list.id}
                      onSelect={() => onSelectList(list.id)}
                      onDelete={(e) => handleDelete(list.id, e)}
                      onArchive={(e) => handleArchive(list.id, true, e)}
                      deleting={deletingId === list.id}
                    />
                  ))}
                </div>
              </div>
            )
          )}

          {/* Archived Lists */}
          {showArchived && archivedLists.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 px-2">
                Archived
              </h4>
              <div className="space-y-1">
                {archivedLists.map((list) => (
                  <ListRow
                    key={list.id}
                    list={list}
                    isSelected={selectedListId === list.id}
                    onSelect={() => onSelectList(list.id)}
                    onDelete={(e) => handleDelete(list.id, e)}
                    onArchive={(e) => handleArchive(list.id, false, e)}
                    deleting={deletingId === list.id}
                    isArchived
                  />
                ))}
              </div>
            </div>
          )}

          {lists.length === 0 && (
            <p className="text-sm text-slate-500 px-2">
              No lists yet. Create one to get started.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ListRow({
  list,
  isSelected,
  onSelect,
  onDelete,
  onArchive,
  deleting,
  isArchived = false,
}: {
  list: TodoList;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onArchive: (e: React.MouseEvent) => void;
  deleting: boolean;
  isArchived?: boolean;
}) {
  return (
    <div
      className={cn(
        'group flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer',
        isSelected
          ? 'bg-slate-100 text-slate-900 font-medium'
          : 'text-slate-600 hover:bg-slate-50',
        isArchived && 'opacity-60'
      )}
      onClick={onSelect}
    >
      <List className="w-4 h-4 flex-shrink-0" />
      <span className="truncate flex-1">{list.title}</span>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onArchive}
          className="p-1 hover:bg-slate-200 rounded transition-colors flex-shrink-0"
          title={isArchived ? 'Unarchive' : 'Archive'}
        >
          {isArchived ? (
            <ArchiveRestore className="w-4 h-4 text-slate-600" />
          ) : (
            <Archive className="w-4 h-4 text-slate-600" />
          )}
        </button>
        <button
          onClick={onDelete}
          disabled={deleting}
          className="p-1 hover:bg-slate-200 rounded transition-colors flex-shrink-0"
          title="Delete list"
        >
          <Trash2 className="w-4 h-4 text-red-600" />
        </button>
      </div>
    </div>
  );
}
