'use client';

import { useState, useEffect } from 'react';
import { Pencil, Trash2, MoreVertical } from 'lucide-react';
import { TodoList, TodoItem } from '@/lib/todo/lists';
import TodoItemRow from './TodoItemRow';
import {
  renameTodoListAction,
  deleteTodoListAction,
  createTodoItemAction,
} from '@/app/todo/actions';

interface TodoListViewProps {
  list: TodoList | null;
  items: TodoItem[];
  onRefresh: () => void;
}

export default function TodoListView({
  list,
  items,
  onRefresh,
}: TodoListViewProps) {
  const [newItemContent, setNewItemContent] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(list?.title || '');
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  // Update edited title when list changes
  useEffect(() => {
    if (list) {
      setEditedTitle(list.title);
      setIsEditingTitle(false);
    }
  }, [list]);

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemContent.trim() || !list) return;

    setCreating(true);
    const formData = new FormData();
    formData.append('list_id', list.id);
    formData.append('content', newItemContent);
    const result = await createTodoItemAction(formData);
    setCreating(false);
    setNewItemContent('');

    if (result.ok) {
      onRefresh();
    } else {
      alert(result.error);
    }
  };

  const handleRename = async () => {
    if (!list || !editedTitle.trim() || editedTitle === list.title) {
      setIsEditingTitle(false);
      setEditedTitle(list?.title || '');
      return;
    }

    setRenaming(true);
    const result = await renameTodoListAction(list.id, editedTitle);
    setRenaming(false);

    if (result.ok) {
      setIsEditingTitle(false);
      onRefresh();
    } else {
      alert(result.error);
      setEditedTitle(list.title);
    }
  };

  const handleDelete = async () => {
    if (!list) return;
    if (!confirm('Delete this list? All items will be deleted too.')) {
      return;
    }

    const result = await deleteTodoListAction(list.id);
    if (result.ok) {
      onRefresh();
    } else {
      alert(result.error);
    }
  };

  if (!list) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <p className="text-lg text-slate-600 mb-2">No list selected</p>
          <p className="text-sm text-slate-500">
            Select a list from the left panel or create a new one
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden">
      {/* Header */}
      <div className="border-b border-slate-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            {isEditingTitle ? (
              <input
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onBlur={handleRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleRename();
                  } else if (e.key === 'Escape') {
                    setIsEditingTitle(false);
                    setEditedTitle(list.title);
                  }
                }}
                autoFocus
                className="text-xl font-semibold text-slate-900 px-2 py-1 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-slate-400 w-full"
              />
            ) : (
              <div className="flex items-center gap-2 group">
                <h2 className="text-xl font-semibold text-slate-900">
                  {list.title}
                </h2>
                <button
                  onClick={() => setIsEditingTitle(true)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-100 rounded transition-opacity"
                  title="Edit title"
                >
                  <Pencil className="w-4 h-4 text-slate-600" />
                </button>
              </div>
            )}
            {list.description && (
              <p className="text-sm text-slate-500 mt-1">{list.description}</p>
            )}
          </div>

          {/* Menu */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 hover:bg-slate-100 rounded transition-colors"
            >
              <MoreVertical className="w-5 h-5 text-slate-600" />
            </button>
            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-slate-200 rounded-md shadow-lg z-20">
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      handleDelete();
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-slate-50"
                  >
                    Delete list
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Add Item Input */}
      <div className="border-b border-slate-200 p-4">
        <form onSubmit={handleCreateItem}>
          <input
            type="text"
            value={newItemContent}
            onChange={(e) => setNewItemContent(e.target.value)}
            placeholder="Add item..."
            disabled={creating}
            className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50"
          />
        </form>
      </div>

      {/* Items List */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-slate-500">
              No items yet. Add one above to get started.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((item) => (
              <TodoItemRow key={item.id} item={item} onRefresh={onRefresh} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
