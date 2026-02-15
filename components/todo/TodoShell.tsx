'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import TodoListsPanel from './TodoListsPanel';
import TodoListView from './TodoListView';
import { TodoList, TodoItem } from '@/lib/todo/lists';
import { getTodoListsAction, getTodoItemsAction } from '@/app/todo/actions';

export default function TodoShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const listIdParam = searchParams.get('list');

  const [lists, setLists] = useState<TodoList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(
    listIdParam
  );
  const [items, setItems] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  // Load lists
  const loadLists = useCallback(async () => {
    const result = await getTodoListsAction({
      includeArchived: showArchived,
    });
    if (result.data) {
      setLists(result.data);
    }
  }, [showArchived]);

  // Load items for selected list
  const loadItems = async (listId: string) => {
    const result = await getTodoItemsAction(listId);
    if (result.data) {
      setItems(result.data);
    }
  };

  useEffect(() => {
    loadLists();
    setLoading(false);
  }, [loadLists]);

  useEffect(() => {
    if (selectedListId) {
      loadItems(selectedListId);
      // Update URL without navigation
      router.replace(`/todo?list=${selectedListId}`, { scroll: false });
    } else {
      setItems([]);
      router.replace('/todo', { scroll: false });
    }
  }, [selectedListId, router]);

  const handleSelectList = (listId: string | null) => {
    setSelectedListId(listId);
  };

  const handleRefresh = () => {
    loadLists();
    if (selectedListId) {
      loadItems(selectedListId);
    }
  };

  const selectedList = lists.find((l) => l.id === selectedListId) || null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-lg text-slate-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-slate-50">
      {/* Left Panel - Lists */}
      <TodoListsPanel
        lists={lists}
        selectedListId={selectedListId}
        onSelectList={handleSelectList}
        onRefresh={handleRefresh}
        showArchived={showArchived}
        onShowArchivedChange={setShowArchived}
      />

      {/* Right Panel - List View */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <TodoListView
          list={selectedList}
          items={items}
          onRefresh={handleRefresh}
        />
      </div>
    </div>
  );
}
