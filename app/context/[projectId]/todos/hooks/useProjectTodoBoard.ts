'use client';

import { useCallback, useState } from 'react';
import type { TodoItem } from '@/lib/todo/lists';
import {
  createTodoItemAction,
  deleteTodoItemAction,
  toggleTodoItemAction,
  updateTodoItemAction,
} from '@/app/actions/todo';
import { toastError } from '@/lib/ui/toast';

type Params = {
  defaultListId: string;
  initialItems: TodoItem[];
};

export function useProjectTodoBoard({ defaultListId, initialItems }: Params) {
  const [items, setItems] = useState<TodoItem[]>(initialItems);
  const [error, setError] = useState<string | null>(null);

  const createItem = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || !defaultListId) return;

      const tempId = `opt-${Date.now()}`;
      const optimistic: TodoItem = {
        id: tempId,
        owner_id: '',
        list_id: defaultListId,
        content: trimmed,
        is_done: false,
        due_date: null,
        position: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      setItems((prev) => [...prev, optimistic]);

      const fd = new FormData();
      fd.append('list_id', defaultListId);
      fd.append('content', trimmed);
      const result = await createTodoItemAction(fd);

      if (!result.ok) {
        setItems((prev) => prev.filter((i) => i.id !== tempId));
        setError(result.error);
        toastError(result.error);
        return;
      }

      setItems((prev) => prev.map((i) => (i.id === tempId ? result.data : i)));
    },
    [defaultListId]
  );

  const toggleItem = useCallback(async (item: TodoItem) => {
    const previous = item.is_done;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, is_done: !i.is_done } : i))
    );

    const result = await toggleTodoItemAction(item.id);
    if (!result.ok) {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_done: previous } : i))
      );
      setError(result.error);
      toastError(result.error);
    }
  }, []);

  const updateItem = useCallback(async (item: TodoItem, content: string) => {
    const trimmed = content.trim();
    if (!trimmed || trimmed === item.content) return;

    const previous = item.content;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, content: trimmed } : i))
    );

    const result = await updateTodoItemAction(item.id, { content: trimmed });
    if (!result.ok) {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, content: previous } : i))
      );
      setError(result.error);
      toastError(result.error);
    }
  }, []);

  const deleteItem = useCallback(
    async (item: TodoItem) => {
      const previous = items;
      setItems((prev) => prev.filter((i) => i.id !== item.id));

      const result = await deleteTodoItemAction(item.id);
      if (!result.ok) {
        setItems(previous);
        setError(result.error);
        toastError(result.error);
      }
    },
    [items]
  );

  return {
    items,
    error,
    setError,
    createItem,
    toggleItem,
    updateItem,
    deleteItem,
  };
}
