'use client'

import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import TaskCard from './TaskCard'
import { AddTaskModal } from './AddTaskModal'
import { Button } from './ui/button'
import { Plus } from 'lucide-react'
import { Database } from '@/lib/supabase/types'

type Task = Database['public']['Tables']['tasks']['Row']
type Project = Database['public']['Tables']['projects']['Row']

interface ColumnProps {
  id: Task['status']
  title: string
  tasks: Task[]
  projects: Project[]
  onTaskUpdate: () => void
}

export default function Column({ id, title, tasks, projects, onTaskUpdate }: ColumnProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const { setNodeRef, isOver } = useDroppable({
    id,
  })

  return (
    <>
      <div className="flex-1 flex flex-col min-w-[280px]">
        {/* Column Header */}
        <div className="bg-slate-100 rounded-t-lg border-b-2 border-slate-300 p-4">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <span className="text-sm text-slate-600">{tasks.length} tasks</span>
        </div>
        
        {/* Cards Container */}
        <div
          ref={setNodeRef}
          className={`flex-1 bg-slate-50 rounded-b-lg p-4 transition-colors ${
            isOver ? 'bg-slate-100' : ''
          }`}
        >
          <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
            {tasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                project={projects.find(p => p.id === task.project_id)}
                projects={projects}
                onTaskUpdate={onTaskUpdate}
              />
            ))}
            </div>
          </SortableContext>
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-3 text-slate-600"
            onClick={() => setIsAddModalOpen(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Task
          </Button>
        </div>
      </div>
      <AddTaskModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onTaskAdded={onTaskUpdate}
        projects={projects}
        defaultStatus={id}
      />
    </>
  )
}
