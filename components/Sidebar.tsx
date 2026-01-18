'use client'

import { useState } from 'react'
import { Database } from '@/lib/supabase/types'
import { AddProjectModal } from './AddProjectModal'
import { Button } from './ui/button'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

type Project = Database['public']['Tables']['projects']['Row']

interface SidebarProps {
  projects: Project[]
  selectedProject: string | null
  onSelectProject: (projectId: string | null) => void
  onProjectAdded: () => void
}

export default function Sidebar({
  projects,
  selectedProject,
  onSelectProject,
  onProjectAdded,
}: SidebarProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)

  return (
    <div className="w-64 bg-white border-r border-slate-200 flex flex-col">
      <div className="p-4 border-b border-slate-200">
        <h1 className="text-xl font-bold text-slate-900 mb-4">ClearQueue</h1>
        <Button
          onClick={() => setIsAddModalOpen(true)}
          className="w-full"
          size="sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Project
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-1">
          <button
            onClick={() => onSelectProject(null)}
            className={cn(
              'w-full text-left px-3 py-2 rounded-md text-sm transition-colors',
              selectedProject === null
                ? 'bg-slate-100 text-slate-900 font-medium'
                : 'text-slate-600 hover:bg-slate-50'
            )}
          >
            All Projects
          </button>
          {projects.map(project => (
            <button
              key={project.id}
              onClick={() => onSelectProject(project.id)}
              className={cn(
                'w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2',
                selectedProject === project.id
                  ? 'bg-slate-100 text-slate-900 font-medium'
                  : 'text-slate-600 hover:bg-slate-50'
              )}
            >
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: project.color || '#94a3b8' }}
              />
              <span className="truncate">{project.name}</span>
            </button>
          ))}
        </div>
      </div>
      <AddProjectModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onProjectAdded={onProjectAdded}
      />
    </div>
  )
}
