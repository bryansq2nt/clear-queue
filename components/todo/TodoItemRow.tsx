'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { TodoItem } from '@/lib/todo/lists';
import {
  toggleTodoItemAction,
  updateTodoItemAction,
  deleteTodoItemAction,
} from '@/app/todo/actions';
import { cn } from '@/lib/utils';

interface TodoItemRowProps {
  item: TodoItem;
  onRefresh: () => void;
}

export default function TodoItemRow({ item, onRefresh }: TodoItemRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(item.content);
  const [isToggling, setIsToggling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleToggle = async () => {
    setIsToggling(true);
    const result = await toggleTodoItemAction(item.id);
    setIsToggling(false);

    if (result.ok) {
      onRefresh();
    } else {
      alert(result.error);
    }
  };

  const handleSave = async () => {
    if (!editedContent.trim()) {
      setEditedContent(item.content);
      setIsEditing(false);
      return;
    }

    if (editedContent === item.content) {
      setIsEditing(false);
      return;
    }

    const result = await updateTodoItemAction(item.id, {
      content: editedContent,
    });

    if (result.ok) {
      setIsEditing(false);
      onRefresh();
    } else {
      alert(result.error);
      setEditedContent(item.content);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this item?')) return;

    setIsDeleting(true);
    const result = await deleteTodoItemAction(item.id);
    setIsDeleting(false);

    if (result.ok) {
      onRefresh();
    } else {
      alert(result.error);
    }
  };

  return (
    <div className="group flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={item.is_done}
        onChange={handleToggle}
        disabled={isToggling}
        className="w-5 h-5 rounded border-slate-300 text-slate-600 focus:ring-2 focus:ring-slate-400 cursor-pointer disabled:opacity-50"
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            type="text"
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSave();
              } else if (e.key === 'Escape') {
                setEditedContent(item.content);
                setIsEditing(false);
              }
            }}
            autoFocus
            className="w-full px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        ) : (
          <span
            onClick={() => setIsEditing(true)}
            className={cn(
              'text-sm cursor-text',
              item.is_done ? 'text-slate-400 line-through' : 'text-slate-900'
            )}
          >
            {item.content}
          </span>
        )}
        {item.due_date && (
          <div className="text-xs text-slate-500 mt-1">
            Due: {new Date(item.due_date).toLocaleDateString()}
          </div>
        )}
      </div>

      {/* Delete Button */}
      <button
        onClick={handleDelete}
        disabled={isDeleting}
        className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-slate-200 rounded transition-opacity disabled:opacity-50"
        title="Delete item"
      >
        <Trash2 className="w-4 h-4 text-red-600" />
      </button>
    </div>
  );
}
