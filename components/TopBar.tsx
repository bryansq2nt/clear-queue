'use client'

import { Database } from '@/lib/supabase/types'
import { Input } from './ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Button } from './ui/button'
import { LogOut } from 'lucide-react'

type Project = Database['public']['Tables']['projects']['Row']

interface TopBarProps {
  projects: Project[]
  selectedProject: string | null
  selectedPriority: number | null
  searchQuery: string
  onProjectChange: (projectId: string | null) => void
  onPriorityChange: (priority: number | null) => void
  onSearchChange: (query: string) => void
  onSignOut: () => void
}

export default function TopBar({
  projects,
  selectedProject,
  selectedPriority,
  searchQuery,
  onProjectChange,
  onPriorityChange,
  onSearchChange,
  onSignOut,
}: TopBarProps) {
  return (
    <div className="bg-white border-b border-slate-200 p-4 flex items-center gap-4">
      <div className="flex-1 flex items-center gap-4">
        <Select
          value={selectedProject || 'all'}
          onValueChange={(value) => onProjectChange(value === 'all' ? null : value)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projects.map(project => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={selectedPriority?.toString() || 'all'}
          onValueChange={(value) => onPriorityChange(value === 'all' ? null : parseInt(value))}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="5">Priority 5 (Highest)</SelectItem>
            <SelectItem value="4">Priority 4</SelectItem>
            <SelectItem value="3">Priority 3</SelectItem>
            <SelectItem value="2">Priority 2</SelectItem>
            <SelectItem value="1">Priority 1 (Lowest)</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Search tasks..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="max-w-sm"
        />
      </div>
      <Button variant="ghost" size="icon" onClick={onSignOut}>
        <LogOut className="w-4 h-4" />
      </Button>
    </div>
  )
}
