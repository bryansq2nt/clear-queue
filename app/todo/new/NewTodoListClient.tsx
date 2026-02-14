'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { useI18n } from '@/components/I18nProvider'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/types'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import { signOut } from '@/app/actions/auth'
import { createTodoListAction } from '@/app/todo/actions'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type Project = Database['public']['Tables']['projects']['Row']

export default function NewTodoListClient() {
  const { t } = useI18n()
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState<string>('')
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const loadProjects = useCallback(async () => {
    const { data } = await supabase.from('projects').select('*').order('name')
    if (data) setProjects(data as Project[])
  }, [supabase])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) {
      setError(t('todo.list_name_required'))
      return
    }
    setError(null)
    setSubmitting(true)
    const formData = new FormData()
    formData.append('title', trimmed)
    formData.append('project_id', projectId || '')
    const result = await createTodoListAction(formData)
    setSubmitting(false)
    if (result.error) {
      setError(result.error)
      return
    }
    if (result.data) {
      router.push(`/todo/list/${result.data.id}`)
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
        projectName={t('todo.new_list_title')}
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
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-xl mx-auto">
            <Link
              href="/todo"
              className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('todo.back_to_todo')}
            </Link>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight mb-2">
              {t('todo.new_list_title')}
            </h1>
            <p className="text-slate-600 dark:text-slate-400 text-sm mb-8">
              {t('todo.new_list_desc')}
            </p>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="new-list-project" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('todo.project_optional')}
                </label>
                <Select value={projectId || 'none'} onValueChange={(v) => setProjectId(v === 'none' ? '' : v)}>
                  <SelectTrigger id="new-list-project" className="w-full">
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
              <div>
                <label htmlFor="new-list-title" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('todo.list_name')}
                </label>
                <Input
                  id="new-list-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('todo.list_name_placeholder')}
                  className="w-full"
                />
              </div>
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              <div className="flex gap-3">
                <Button type="submit" disabled={submitting}>
                  {submitting ? t('clients.creating') : t('todo.create_and_open')}
                </Button>
                <Button type="button" variant="outline" onClick={() => router.push('/todo')}>
                  {t('common.cancel')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
