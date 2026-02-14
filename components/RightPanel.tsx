'use client'

import Link from 'next/link'
import { useI18n } from '@/components/I18nProvider'
import { Database } from '@/lib/supabase/types'
import TaskCard from './TaskCard'
import { FileText, Plus } from 'lucide-react'

type Task = Database['public']['Tables']['tasks']['Row']
type Project = Database['public']['Tables']['projects']['Row']
type Note = Database['public']['Tables']['notes']['Row']

interface RightPanelProps {
  todayTasks: Task[]
  nextUpTasks: Task[]
  projects: Project[]
  projectId?: string
  projectNotes?: Note[]
}

export default function RightPanel({ todayTasks, nextUpTasks, projects, projectId, projectNotes = [] }: RightPanelProps) {
  const { t } = useI18n()
  const notes = projectNotes.slice(0, 5)

  return (
    <div className="w-80 bg-card border-l border-border p-4 overflow-y-auto">
      <div className="space-y-6">
        <div>
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg px-4 py-3 mb-3 shadow-md">
            <h2 className="text-base font-bold text-white">{t('right_panel.today')}</h2>
          </div>
          <div className="space-y-2">
            {todayTasks.length === 0 ? (
              <p className="text-sm text-slate-500">{t('right_panel.no_tasks_today')}</p>
            ) : (
              todayTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  project={projects.find(p => p.id === task.project_id)}
                  onTaskUpdate={() => {}}
                />
              ))
            )}
          </div>
        </div>
        <div>
          <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg px-4 py-3 mb-3 shadow-md">
            <h2 className="text-base font-bold text-white">{t('right_panel.next_up')}</h2>
          </div>
          <div className="space-y-2">
            {nextUpTasks.length === 0 ? (
              <p className="text-sm text-slate-500">{t('right_panel.no_tasks_next')}</p>
            ) : (
              nextUpTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  project={projects.find(p => p.id === task.project_id)}
                  onTaskUpdate={() => {}}
                />
              ))
            )}
          </div>
        </div>
        {projectId && (
          <div>
            <div className="bg-gradient-to-r from-slate-500 to-slate-600 rounded-lg px-4 py-3 mb-3 shadow-md flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4" />
                {t('right_panel.notes')}
              </h2>
            </div>
            <div className="space-y-2">
              {notes.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('right_panel.no_notes')}</p>
              ) : (
                notes.map(note => (
                  <Link
                    key={note.id}
                    href={`/notes/${note.id}`}
                    className="block text-sm text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white truncate"
                  >
                    {note.title}
                  </Link>
                ))
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <Link
                  href={`/notes?projectId=${projectId}`}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {t('right_panel.view_all')}
                </Link>
                <Link
                  href={`/notes/new?projectId=${projectId}`}
                  className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
                >
                  <Plus className="w-3 h-3" />
                  {t('right_panel.add_note')}
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
