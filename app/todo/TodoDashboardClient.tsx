'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Plus } from 'lucide-react';
import { getTodoListsAction } from './actions';
import { getProjects } from '@/app/budgets/actions';
import type { TodoList } from '@/lib/todo/lists';
import { cn } from '@/lib/utils';
import { useI18n } from '@/components/I18nProvider';

export default function TodoDashboardClient() {
  const { t } = useI18n();
  const router = useRouter();
  const [lists, setLists] = useState<TodoList[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [listsResult, projectsData] = await Promise.all([
      getTodoListsAction({ includeArchived: false }),
      getProjects(),
    ]);
    setLoading(false);
    if (listsResult.error) {
      setError(listsResult.error);
      return;
    }
    if (listsResult.data) setLists(listsResult.data);
    setProjects(projectsData);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const projectName = (projectId: string | null) =>
    projectId
      ? (projects.find((p) => p.id === projectId)?.name ??
        t('todo.unknown_project'))
      : t('todo.no_project');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <p className="text-slate-500 dark:text-slate-400">
          {t('common.loading')}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4">
        <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto relative">
      <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">
        {t('todo.subtitle')}
      </p>

      {lists.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-slate-600 dark:text-slate-400">
            {t('todo.no_lists_yet')}
          </p>
        </div>
      ) : (
        <ul className="space-y-1">
          {lists.map((list) => (
            <li key={list.id}>
              <button
                type="button"
                onClick={() => router.push(`/todo/list/${list.id}`)}
                className={cn(
                  'group w-full text-left rounded-xl border border-border',
                  'bg-card hover:bg-accent/50',
                  'px-5 py-4 flex items-center justify-between gap-4 transition-colors',
                  'focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-gray-600'
                )}
              >
                <span className="font-medium text-slate-900 dark:text-white truncate">
                  {list.title}
                </span>
                <span className="text-sm text-slate-500 dark:text-slate-400 flex-shrink-0">
                  {projectName(list.project_id)}
                </span>
                <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* FAB: Agregar nueva lista */}
      <Link
        href="/todo/new"
        title={t('todo.add_new_list')}
        aria-label={t('todo.add_new_list')}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background md:bottom-8 md:right-8"
      >
        <Plus className="w-6 h-6" />
      </Link>
    </div>
  );
}
