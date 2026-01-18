'use client'

import { Database } from '@/lib/supabase/types'
import TaskCard from './TaskCard'

type Task = Database['public']['Tables']['tasks']['Row']
type Project = Database['public']['Tables']['projects']['Row']

interface RightPanelProps {
  todayTasks: Task[]
  nextUpTasks: Task[]
  projects: Project[]
}

export default function RightPanel({ todayTasks, nextUpTasks, projects }: RightPanelProps) {
  return (
    <div className="w-80 bg-white border-l border-slate-200 p-4 overflow-y-auto">
      <div className="space-y-6">
        <div>
          <div className="bg-slate-100 rounded-lg p-3 mb-3">
            <h2 className="text-lg font-bold text-slate-900">Today</h2>
          </div>
          <div className="space-y-2">
            {todayTasks.length === 0 ? (
              <p className="text-sm text-slate-500">No tasks due today</p>
            ) : (
              todayTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  project={projects.find(p => p.id === task.project_id)}
                  projects={projects}
                  onTaskUpdate={() => {}}
                />
              ))
            )}
          </div>
        </div>
        <div>
          <div className="bg-slate-100 rounded-lg p-3 mb-3">
            <h2 className="text-lg font-bold text-slate-900">Next Up</h2>
          </div>
          <div className="space-y-2">
            {nextUpTasks.length === 0 ? (
              <p className="text-sm text-slate-500">No tasks in Next</p>
            ) : (
              nextUpTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  project={projects.find(p => p.id === task.project_id)}
                  projects={projects}
                  onTaskUpdate={() => {}}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
