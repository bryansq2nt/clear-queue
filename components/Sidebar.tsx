'use client'

import { useState, useEffect, useCallback } from 'react'
import { Database } from '@/lib/supabase/types'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { cn } from '@/lib/utils'
import { useRouter, usePathname } from 'next/navigation'
import { LayoutDashboard, MoreVertical, Edit, Archive, ArchiveRestore, Trash2, Plus, Lightbulb, DollarSign, CheckSquare, Star } from 'lucide-react'
import Link from 'next/link'
import { PROJECT_CATEGORIES, getCategoryLabel } from '@/lib/constants'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { EditProjectModal } from './EditProjectModal'
import { AddProjectModal } from './AddProjectModal'
import { archiveProject, unarchiveProject, deleteProject, getFavoriteProjectIds, addProjectFavorite, removeProjectFavorite } from '@/app/actions/projects'

type Project = Database['public']['Tables']['projects']['Row']

interface SidebarProps {
  projects: Project[]
  selectedProject: string | null
  selectedCategory: string | null
  showArchived: boolean
  onSelectProject: (projectId: string | null) => void
  onCategoryChange: (category: string | null) => void
  onShowArchivedChange: (show: boolean) => void
  onProjectUpdated: () => void
}

export default function Sidebar({
  projects,
  selectedProject,
  selectedCategory,
  showArchived,
  onSelectProject,
  onCategoryChange,
  onShowArchivedChange,
  onProjectUpdated,
}: SidebarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [isAddProjectModalOpen, setIsAddProjectModalOpen] = useState(false)
  const [favoriteProjectIds, setFavoriteProjectIds] = useState<Set<string>>(new Set())

  const loadFavorites = useCallback(async () => {
    const { data } = await getFavoriteProjectIds()
    setFavoriteProjectIds(new Set(data || []))
  }, [])

  useEffect(() => {
    loadFavorites()
  }, [loadFavorites])

  async function handleToggleFavorite(projectId: string, isFavorite: boolean) {
    if (isFavorite) {
      const { error } = await removeProjectFavorite(projectId)
      if (!error) setFavoriteProjectIds(prev => { const n = new Set(prev); n.delete(projectId); return n })
    } else {
      const { error } = await addProjectFavorite(projectId)
      if (!error) setFavoriteProjectIds(prev => new Set(prev).add(projectId))
    }
    onProjectUpdated()
  }

  const favoriteProjects = projects.filter(p => favoriteProjectIds.has(p.id))

  // Filter projects based on selectedCategory and showArchived
  const filteredProjects = projects.filter(p => {
    // Filter by category if selected
    if (selectedCategory && p.category !== selectedCategory) return false
    // Filter out archived if toggle is off
    if (!showArchived && p.category === 'archived') return false
    return true
  })

  // Group filtered projects by category
  const groupedProjects = PROJECT_CATEGORIES.reduce((acc, category) => {
    const categoryProjects = filteredProjects.filter(p => p.category === category.key)
    if (categoryProjects.length > 0) {
      acc[category.key] = categoryProjects
    }
    return acc
  }, {} as Record<string, Project[]>)

  // Filter out archived if toggle is off
  const visibleCategories = showArchived
    ? PROJECT_CATEGORIES
    : PROJECT_CATEGORIES.filter(c => c.key !== 'archived')

  async function handleArchive(project: Project) {
    if (project.category === 'archived') {
      await unarchiveProject(project.id)
    } else {
      await archiveProject(project.id)
    }
    onProjectUpdated()
  }

  async function handleDelete(project: Project) {
    if (!confirm(`Delete project "${project.name}" and all its tasks? This cannot be undone.`)) {
      return
    }
    setIsDeleting(project.id)
    await deleteProject(project.id)
    setIsDeleting(null)
    onProjectUpdated()
    if (selectedProject === project.id) {
      router.push('/dashboard')
    }
  }

  return (
    <>
      <div className="w-64 bg-white border-r border-slate-200 flex flex-col overflow-y-auto shadow-lg">
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
              <Link
                href="/ideas"
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                  pathname?.startsWith('/ideas')
                    ? 'bg-slate-100 text-slate-900 font-medium'
                    : 'text-slate-600 hover:bg-slate-50'
                )}
              >
                <Lightbulb className="w-4 h-4" />
                Idea Graph
              </Link>
              <Link
                href="/todo"
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                  pathname?.startsWith('/todo')
                    ? 'bg-slate-100 text-slate-900 font-medium'
                    : 'text-slate-600 hover:bg-slate-50'
                )}
              >
                <CheckSquare className="w-4 h-4" />
                To-do List
              </Link>
              <Link
                href="/budgets"
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                  pathname?.startsWith('/budgets')
                    ? 'bg-slate-100 text-slate-900 font-medium'
                    : 'text-slate-600 hover:bg-slate-50'
                )}
              >
                <DollarSign className="w-4 h-4" />
                Budgets
              </Link>
              <button
                onClick={() => setIsAddProjectModalOpen(true)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                  'text-slate-600 hover:bg-slate-50'
                )}
              >
                <Plus className="w-4 h-4" />
                Add Project
              </button>
            </div>
          </div>

          {/* Favorite Projects */}
          {favoriteProjects.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">
                Favorites
              </label>
              <div className="space-y-1">
                {favoriteProjects.map(project => (
                    <div
                      key={project.id}
                      className={cn(
                        'group flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                        selectedProject === project.id || pathname === `/project/${project.id}`
                          ? 'bg-slate-100 text-slate-900 font-medium'
                          : 'text-slate-600 hover:bg-slate-50'
                      )}
                    >
                      <button
                        onClick={() => {
                          onSelectProject(project.id)
                          router.push(`/project/${project.id}`)
                        }}
                        className="flex items-center gap-2 flex-1 text-left min-w-0"
                      >
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: project.color || '#94a3b8' }}
                        />
                        <span className="truncate flex-1 min-w-0">{project.name}</span>
                        {project.category === 'archived' && (
                          <span className="text-xs text-slate-400 flex-shrink-0">Archived</span>
                        )}
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <button
                            className="opacity-60 group-hover:opacity-100 p-1 hover:bg-slate-200 rounded transition-opacity flex-shrink-0"
                            onClick={(e) => e.stopPropagation()}
                            title="Project options"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleToggleFavorite(project.id, true)}>
                            <Star className="w-4 h-4 mr-2 fill-amber-400 text-amber-500" />
                            Remove from favorites
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setEditingProject(project)}>
                            <Edit className="w-4 h-4 mr-2" />
                            Edit Project
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {project.category === 'archived' ? (
                            <DropdownMenuItem onClick={() => handleArchive(project)}>
                              <ArchiveRestore className="w-4 h-4 mr-2" />
                              Unarchive
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => handleArchive(project)}>
                              <Archive className="w-4 h-4 mr-2" />
                              Archive
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDelete(project)}
                            className="text-red-600 focus:text-red-600"
                            disabled={isDeleting === project.id}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            {isDeleting === project.id ? 'Deleting...' : 'Delete'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                ))}
              </div>
            </div>
          )}

          {/* Projects List - Grouped by Category */}
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

              {/* Filter by Category - positioned below All Projects */}
              <div className="px-3 py-2">
                <Select
                  value={selectedCategory || 'all'}
                  onValueChange={(value) => onCategoryChange(value === 'all' ? null : value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Filter by Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {PROJECT_CATEGORIES.filter(c => c.key !== 'archived' || showArchived).map(cat => (
                      <SelectItem key={cat.key} value={cat.key}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Show Archived Toggle - positioned below category filter */}
              <button
                onClick={() => onShowArchivedChange(!showArchived)}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-md text-sm transition-colors',
                  showArchived
                    ? 'bg-slate-100 text-slate-900 font-medium'
                    : 'text-slate-600 hover:bg-slate-50'
                )}
              >
                {showArchived ? '✓' : ''} Show Archived
              </button>
              {visibleCategories.map(category => {
                const categoryProjects = groupedProjects[category.key] || []
                if (categoryProjects.length === 0) return null

                return (
                  <div key={category.key} className="mt-3">
                    <div className="text-xs font-medium text-slate-500 px-3 py-1 uppercase tracking-wide">
                      {category.label}
                    </div>
                    <div className="space-y-1 mt-1">
                      {categoryProjects.map(project => (
                        <div
                          key={project.id}
                          className={cn(
                            'group flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                            selectedProject === project.id || pathname === `/project/${project.id}`
                              ? 'bg-slate-100 text-slate-900 font-medium'
                              : 'text-slate-600 hover:bg-slate-50'
                          )}
                        >
                          <button
                            onClick={() => {
                              onSelectProject(project.id)
                              router.push(`/project/${project.id}`)
                            }}
                            className="flex items-center gap-2 flex-1 text-left min-w-0"
                          >
                            <div
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: project.color || '#94a3b8' }}
                            />
                            <span className="truncate flex-1 min-w-0">{project.name}</span>
                            {project.category === 'archived' && (
                              <span className="text-xs text-slate-400 flex-shrink-0">Archived</span>
                            )}
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <button
                                className="opacity-60 group-hover:opacity-100 p-1 hover:bg-slate-200 rounded transition-opacity flex-shrink-0"
                                onClick={(e) => e.stopPropagation()}
                                title="Project options"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleToggleFavorite(project.id, favoriteProjectIds.has(project.id))}>
                                {favoriteProjectIds.has(project.id) ? (
                                  <>
                                    <Star className="w-4 h-4 mr-2 fill-amber-400 text-amber-500" />
                                    Remove from favorites
                                  </>
                                ) : (
                                  <>
                                    <Star className="w-4 h-4 mr-2" />
                                    Add to favorites
                                  </>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setEditingProject(project)}>
                                <Edit className="w-4 h-4 mr-2" />
                                Edit Project
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {project.category === 'archived' ? (
                                <DropdownMenuItem onClick={() => handleArchive(project)}>
                                  <ArchiveRestore className="w-4 h-4 mr-2" />
                                  Unarchive
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => handleArchive(project)}>
                                  <Archive className="w-4 h-4 mr-2" />
                                  Archive
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleDelete(project)}
                                className="text-red-600 focus:text-red-600"
                                disabled={isDeleting === project.id}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                {isDeleting === project.id ? 'Deleting...' : 'Delete'}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
      {editingProject && (
        <EditProjectModal
          isOpen={!!editingProject}
          onClose={() => setEditingProject(null)}
          onProjectUpdated={() => {
            onProjectUpdated()
            setEditingProject(null)
          }}
          project={editingProject}
        />
      )}
      <AddProjectModal
        isOpen={isAddProjectModalOpen}
        onClose={() => setIsAddProjectModalOpen(false)}
        onProjectAdded={() => {
          onProjectUpdated()
          setIsAddProjectModalOpen(false)
        }}
      />
    </>
  )
}
