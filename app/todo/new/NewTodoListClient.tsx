'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Link2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/types'
import { GlobalHeader } from '@/components/GlobalHeader'
import { createTodoListAction, createTodoItemAction } from '@/app/todo/actions'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useI18n } from '@/components/I18nProvider'

type Project = Database['public']['Tables']['projects']['Row']

export default function NewTodoListClient() {
  const { t } = useI18n()
  const router = useRouter()
  const [titleValue, setTitleValue] = useState('')
  const [projectId, setProjectId] = useState<string | null>(null)
  const [newTaskContent, setNewTaskContent] = useState('')
  const [pendingTasks, setPendingTasks] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [linkProjectOpen, setLinkProjectOpen] = useState(false)
  const newTaskInputRef = useRef<HTMLInputElement>(null)
  const creatingRef = useRef(false)
  const pendingQueueRef = useRef<string[]>([])

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

  const createListAndRedirect = useCallback(
    async (listTitle: string) => {
      const formData = new FormData()
      formData.append('title', listTitle.trim() || t('todo.untitled_list'))
      formData.append('project_id', projectId ?? '')
      const result = await createTodoListAction(formData)
      if (result.error) {
        setError(result.error)
        return null
      }
      if (result.data) return result.data.id
      return null
    },
    [projectId, t]
  )

  const handleTitleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const trimmed = titleValue.trim()
    if (!trimmed) return
    setError(null)
    const listId = await createListAndRedirect(trimmed)
    if (listId) router.push(`/todo/list/${listId}`)
  }

  const submitNewTask = useCallback(
    (content: string) => {
      const trimmed = content.trim()
      if (!trimmed) return
      setError(null)
      pendingQueueRef.current = [...pendingQueueRef.current, trimmed]
      setPendingTasks((prev) => [...prev, trimmed])
      setNewTaskContent('')
      newTaskInputRef.current?.focus()

      if (creatingRef.current) return
      const listTitle = titleValue.trim() || t('todo.untitled_list')
      const projectIdVal = projectId ?? ''
      creatingRef.current = true

      createTodoListAction(
        (() => {
          const fd = new FormData()
          fd.append('title', listTitle)
          fd.append('project_id', projectIdVal)
          return fd
        })()
      ).then((listResult) => {
        if (listResult.error || !listResult.data) {
          creatingRef.current = false
          pendingQueueRef.current = []
          setPendingTasks([])
          setError(listResult.error ?? null)
          return
        }
        const listId = listResult.data.id

        const processQueue = (): Promise<void> => {
          const queue = [...pendingQueueRef.current]
          if (queue.length === 0) {
            creatingRef.current = false
            router.push(`/todo/list/${listId}`)
            router.refresh()
            return Promise.resolve()
          }
          pendingQueueRef.current = []
          setPendingTasks([])

          const createNext = (index: number): Promise<void> => {
            if (index >= queue.length) {
              return processQueue()
            }
            const itemFormData = new FormData()
            itemFormData.append('list_id', listId)
            itemFormData.append('content', queue[index])
            return createTodoItemAction(itemFormData).then((itemResult) => {
              if (itemResult.error) {
                creatingRef.current = false
                setError(itemResult.error)
                return
              }
              return createNext(index + 1)
            })
          }
          return createNext(0)
        }
        return processQueue()
      })
    },
    [titleValue, projectId, t, router]
  )

  const handleNewTaskKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const content = newTaskContent.trim()
    if (!content) return
    submitNewTask(content)
  }

  const handleProjectChange = (newProjectId: string) => {
    setProjectId(newProjectId === 'none' ? null : newProjectId)
    setLinkProjectOpen(false)
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <GlobalHeader
        backHref="/todo"
        backLabel=""
        title={t('todo.title')}
      />
      <main className="flex-1 overflow-y-auto min-h-0 px-4 sm:px-6 py-4">
        <div className="max-w-5xl mx-auto w-full pb-24">
          {/* List title - placeholder style, same as list view */}
          <div className="border-b border-border pb-4 mb-4">
            <input
              type="text"
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onKeyDown={handleTitleKeyDown}
              placeholder={t('todo.list_name_placeholder')}
              className="text-xl font-semibold bg-transparent border-0 border-b border-slate-300 dark:border-gray-600 focus:outline-none focus:ring-0 py-0.5 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 min-w-[200px] w-full"
              aria-label={t('todo.list_name')}
            />
          </div>

          {error && (
            <p className="mt-3 text-sm text-destructive">{error}</p>
          )}

          {/* Pending tasks (saving in background) + new task row */}
          <div className="mt-6">
            <ul className="divide-y divide-slate-100 dark:divide-gray-800">
              {pendingTasks.map((content, i) => (
                <li key={`pending-${i}`} className="flex items-center gap-3 py-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-slate-300 dark:border-gray-600 bg-transparent" aria-hidden />
                  <span className="flex-1 min-w-0 text-base text-slate-700 dark:text-slate-300">
                    {content}
                  </span>
                </li>
              ))}
              <li className="flex items-center gap-3 py-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-slate-300 dark:border-gray-600 bg-transparent" aria-hidden />
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

      {/* FAB: link list to project */}
      <div className="fixed bottom-6 right-6 z-40 md:bottom-8 md:right-8">
        <button
          type="button"
          onClick={() => setLinkProjectOpen(true)}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
          aria-label={t('todo.link_list_to_project')}
          title={t('todo.link_list_to_project')}
        >
          <Link2 className="w-6 h-6" />
        </button>
      </div>

      <Dialog open={linkProjectOpen} onOpenChange={setLinkProjectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('todo.link_list_to_project')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Select
              value={projectId ?? 'none'}
              onValueChange={handleProjectChange}
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
  )
}
