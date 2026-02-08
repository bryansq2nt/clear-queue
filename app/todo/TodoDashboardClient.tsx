'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Plus } from 'lucide-react'
import { getTodoListsAction } from './actions'
import { getProjects } from '@/app/budgets/actions'
import type { TodoList } from '@/lib/todo/lists'
import { cn } from '@/lib/utils'

export default function TodoDashboardClient() {
  const router = useRouter()
  const [lists, setLists] = useState<TodoList[]>([])
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [listsResult, projectsData] = await Promise.all([
      getTodoListsAction({ includeArchived: false }),
      getProjects(),
    ])
    setLoading(false)
    if (listsResult.error) {
      setError(listsResult.error)
      return
    }
    if (listsResult.data) setLists(listsResult.data)
    setProjects(projectsData)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const projectName = (projectId: string | null) =>
    projectId ? (projects.find((p) => p.id === projectId)?.name ?? 'Unknown project') : 'No project'

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <p className="text-slate-500 dark:text-slate-400">Loading...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4">
        <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">
            To-do
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">
            Your to-do lists. Open one to manage tasks.
          </p>
        </div>
        <Link
          href="/todo/new"
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-4 py-2.5 text-sm font-medium hover:opacity-90"
        >
          <Plus className="w-4 h-4" />
          Add new to-do list
        </Link>
      </div>

      {lists.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 p-8 text-center">
          <p className="text-slate-600 dark:text-slate-400 mb-4">No to-do lists yet.</p>
          <Link
            href="/todo/new"
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-4 py-2.5 text-sm font-medium hover:opacity-90"
          >
            <Plus className="w-4 h-4" />
            Add new to-do list
          </Link>
        </div>
      ) : (
        <ul className="space-y-1">
          {lists.map((list) => (
            <li key={list.id}>
              <button
                type="button"
                onClick={() => router.push(`/todo/list/${list.id}`)}
                className={cn(
                  'group w-full text-left rounded-xl border border-slate-200 dark:border-gray-700',
                  'bg-white dark:bg-gray-900/50 hover:bg-slate-50 dark:hover:bg-gray-800/50',
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
    </div>
  );
}