'use client'

import { Database } from '@/lib/supabase/types'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { cn } from '@/lib/utils'
import { useRouter, usePathname } from 'next/navigation'
import { LayoutDashboard } from 'lucide-react'
import Link from 'next/link'

type Project = Database['public']['Tables']['projects']['Row']

interface SidebarProps {
  projects: Project[]
  selectedProject: string | null
  selectedPriority: number | null
  onSelectProject: (projectId: string | null) => void
  onPriorityChange: (priority: number | null) => void
}

export default function Sidebar({
  projects,
  selectedProject,
  selectedPriority,
  onSelectProject,
  onPriorityChange,
}: SidebarProps) {
  const router = useRouter()
  const pathname = usePathname()

  return (
    <div className="w-64 bg-white border-r border-slate-200 flex flex-col overflow-y-auto">
      <div className="p-4 space-y-6">
        {/* Navigation */}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">
            Navigation
          </label>
          <div className="space-y-1">
            <Link
              href="/dashboard"
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                pathname === '/dashboard'
                  ? 'bg-slate-100 text-slate-900 font-medium'
                  : 'text-slate-600 hover:bg-slate-50'
              )}
            >
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
            </Link>
          </div>
        </div>

        {/* Filters Section */}
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">
              Filter by Project
            </label>
            <Select
              value={selectedProject || 'all'}
              onValueChange={(value) => onSelectProject(value === 'all' ? null : value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All Projects" />
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
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">
              Filter by Priority
            </label>
            <Select
              value={selectedPriority?.toString() || 'all'}
              onValueChange={(value) => onPriorityChange(value === 'all' ? null : parseInt(value))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All Priorities" />
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
          </div>
        </div>

        {/* Projects List */}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">
            Projects
          </label>
          <div className="space-y-1">
            <button
              onClick={() => {
                onSelectProject(null)
                router.push('/dashboard')
              }}
              className={cn(
                'w-full text-left px-3 py-2 rounded-md text-sm transition-colors',
                selectedProject === null || pathname === '/dashboard'
                  ? 'bg-slate-100 text-slate-900 font-medium'
                  : 'text-slate-600 hover:bg-slate-50'
              )}
            >
              All Projects
            </button>
            {projects.map(project => (
              <button
                key={project.id}
                onClick={() => {
                  onSelectProject(project.id)
                  router.push(`/project/${project.id}`)
                }}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2',
                  selectedProject === project.id || pathname === `/project/${project.id}`
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
      </div>
    </div>
  )
}
