'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/types'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import { signOut } from '@/app/actions/auth'
import {
  createTodoItemAction,
  toggleTodoItemAction,
  updateTodoItemAction,
  deleteTodoItemAction,
  renameTodoListAction,
  updateTodoListAction,
  deleteTodoListAction,
} from '@/app/todo/actions'
import type { TodoItem } from '@/lib/todo/lists'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useI18n } from '@/components/I18nProvider'

type Project = Database['public']['Tables']['projects']['Row']

interface ListBoardClientProps {
  listId: string
  initialListTitle: string
  initialProjectId: string | null
  initialProjectName: string | null
  initialItems: TodoItem[]
}

export default function ListBoardClient({
  listId,
  initialListTitle,
  initialProjectId,
  initialProjectName,
  initialItems,
}: ListBoardClientProps) {
  const { t } = useI18n()
  const router = useRouter()
  const [listTitle, setListTitle] = useState(initialListTitle)
  const [projectId, setProjectId] = useState<string | null>(initialProjectId)
  const [items, setItems] = useState<TodoItem[]>(initialItems)
  const [projects, setProjects] = useState<Project[]>([])
  const [newTaskContent, setNewTaskContent] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState(initialListTitle)
  const [savingTitle, setSavingTitle] = useState(false)
  const [savingProject, setSavingProject] = useState(false)
  const [deletingList, setDeletingList] = useState(false)

  const loadProjects = useCallback(async () => {
    const { data } = await createClient()
      .from('projects')
      .select('*')
      .order('name')
    if (data) setProjects(data as Project[])
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  useEffect(() => {
    setListTitle(initialListTitle)
    setTitleValue(initialListTitle)
    setProjectId(initialProjectId)
  }, [initialListTitle, initialProjectId])

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault()
    const content = newTaskContent.trim()
    if (!content) return

    setError(null)
    setAdding(true)
    const formData = new FormData()
    formData.append('list_id', listId)
    formData.append('content', content)
    const result = await createTodoItemAction(formData)
    setAdding(false)
    setNewTaskContent('')

    if (result.data) {
      setItems((prev) => [...prev, result.data!])
      router.refresh()
    } else if (result.error) {
      setError(result.error)
    }
  }

  const handleToggle = async (item: TodoItem) => {
    const result = await toggleTodoItemAction(item.id)
    if (result.data) {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_done: !i.is_done } : i))
      )
      router.refresh()
    }
  }

  const handleUpdateContent = async (item: TodoItem, content: string) => {
    const trimmed = content.trim()
    if (trimmed === item.content) return
    if (!trimmed) return

    const result = await updateTodoItemAction(item.id, { content: trimmed })
    if (result.data) {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, content: trimmed } : i))
      )
      router.refresh()
    }
  }

  const handleDelete = async (item: TodoItem) => {
    const result = await deleteTodoItemAction(item.id)
    if (result.success) {
      setItems((prev) => prev.filter((i) => i.id !== item.id))
      router.refresh()
    }
  }

  const handleSaveTitle = async () => {
    const t = titleValue.trim()
    if (!t || t === listTitle) {
      setEditingTitle(false)
      setTitleValue(listTitle)
      return
    }
    setSavingTitle(true)
    const result = await renameTodoListAction(listId, t)
    setSavingTitle(false)
    if (result.data) {
      setListTitle(t)
      setEditingTitle(false)
      router.refresh()
    } else if (result.error) {
      setError(result.error)
    }
  }

  const handleProjectChange = async (newProjectId: string) => {
    const value = newProjectId === 'none' ? null : newProjectId
    if (value === projectId) return
    setSavingProject(true)
    const result = await updateTodoListAction(listId, { project_id: value })
    setSavingProject(false)
    if (result.data) {
      setProjectId(value)
      router.refresh()
    } else if (result.error) {
      setError(result.error)
    }
  }

  const handleDeleteList = async () => {
    if (!confirm(t('todo.delete_list_confirm', { title: listTitle }))) return
    setDeletingList(true)
    const result = await deleteTodoListAction(listId)
    setDeletingList(false)
    if (result.success) {
      router.push('/todo')
    } else if (result.error) {
      setError(result.error)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <TopBar
        searchQuery=""
        onSearchChange={() => {}}
        onSignOut={() => signOut()}
        onProjectAdded={loadProjects}
        onProjectUpdated={loadProjects}
        projectName={listTitle}
        currentProject={null}
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
        />
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto w-full px-6 py-6">
            <div className="sticky top-0 z-10 -mx-6 px-6 py-3 bg-background/95 backdrop-blur border-b border-border space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/todo"
                  className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                  <ArrowLeft className="w-4 h-4" />
                  {t('todo.back_to_todo')}
                </Link>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                {editingTitle ? (
                  <input
                    type="text"
                    value={titleValue}
                    onChange={(e) => setTitleValue(e.target.value)}
                    onBlur={handleSaveTitle}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveTitle()
                      if (e.key === 'Escape') {
                        setTitleValue(listTitle)
                        setEditingTitle(false)
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
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500 dark:text-slate-400">{t('todo.project_label')}</span>
                  <Select
                    value={projectId ?? 'none'}
                    onValueChange={handleProjectChange}
                    disabled={savingProject}
                  >
                    <SelectTrigger className="w-[180px] h-9">
                      <SelectValue placeholder={t('billings.no_project')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('billings.no_project')}</SelectItem>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <button
                  type="button"
                  onClick={handleDeleteList}
                  disabled={deletingList}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-800 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  {t('todo.delete_list')}
                </button>
              </div>
            </div>

            {error && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            <form onSubmit={handleAddTask} className="mt-6">
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={newTaskContent}
                  onChange={(e) => setNewTaskContent(e.target.value)}
                  placeholder={t('todo.add_task_placeholder')}
                  disabled={adding}
                  className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-base text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-gray-600"
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

            <div className="mt-6">
              {items.length === 0 ? (
                <p className="text-slate-500 dark:text-slate-400 text-sm py-8">
                  {t('todo.no_tasks_yet')}
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-gray-800">
                  {items.map((item) => (
                    <TaskRow
                      key={item.id}
                      item={item}
                      onToggle={() => handleToggle(item)}
                      onSaveContent={(content) => handleUpdateContent(item, content)}
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
  )
}

function TaskRow({
  item,
  onToggle,
  onSaveContent,
  onDelete,
}: {
  item: TodoItem
  onToggle: () => void
  onSaveContent: (content: string) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(item.content)

  useEffect(() => {
    setValue(item.content)
  }, [item.content])

  const handleBlur = () => {
    const trimmed = value.trim()
    if (trimmed && trimmed !== item.content) onSaveContent(trimmed)
    setEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleBlur()
    }
    if (e.key === 'Escape') {
      setValue(item.content)
      setEditing(false)
    }
  }

  return (
    <li className="group flex items-center gap-3 py-3">
      <input
        type="checkbox"
        checked={item.is_done}
        onChange={onToggle}
        className="flex-shrink-0 w-5 h-5 rounded border-slate-300 dark:border-gray-600 text-slate-600 focus:ring-slate-400 cursor-pointer"
      />
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
  )
}
