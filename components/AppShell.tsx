'use client'

import { useState } from 'react'
import Sidebar from './Sidebar'
import { GlobalHeader } from './GlobalHeader'
import { Database } from '@/lib/supabase/types'
import { cn } from '@/lib/utils'

type Project = Database['public']['Tables']['projects']['Row']

export interface AppShellProps {
  /** Header title */
  title: string
  /** If set, show back link instead of sidebar menu button */
  backHref?: string
  backLabel?: string
  /** Optional right-side action in header */
  rightAction?: React.ReactNode
  /** Sidebar: project list and selection state */
  projects: Project[]
  selectedProject?: string | null
  selectedCategory?: string | null
  showArchived?: boolean
  onSelectProject?: (projectId: string | null) => void
  onCategoryChange?: (category: string | null) => void
  onShowArchivedChange?: (show: boolean) => void
  onProjectUpdated?: () => void
  children: React.ReactNode
  /** Optional class for main content area */
  contentClassName?: string
}

/**
 * Global app shell: collapsible sidebar + global header + content.
 * Mobile-first: sidebar is a drawer on small screens, opened via header menu button.
 */
export function AppShell({
  title,
  backHref,
  backLabel,
  rightAction,
  projects,
  selectedProject = null,
  selectedCategory = null,
  showArchived = false,
  onSelectProject = () => {},
  onCategoryChange = () => {},
  onShowArchivedChange = () => {},
  onProjectUpdated = () => {},
  children,
  contentClassName,
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex flex-col h-screen bg-background">
      <GlobalHeader
        title={title}
        backHref={backHref}
        backLabel={backLabel}
        onOpenSidebar={backHref == null ? () => setSidebarOpen(true) : undefined}
        rightAction={rightAction}
      />
      <div className="flex-1 flex overflow-hidden min-h-0">
        <Sidebar
          projects={projects}
          selectedProject={selectedProject ?? null}
          selectedCategory={selectedCategory ?? null}
          showArchived={showArchived}
          onSelectProject={onSelectProject}
          onCategoryChange={onCategoryChange}
          onShowArchivedChange={onShowArchivedChange}
          onProjectUpdated={onProjectUpdated}
          mobileOpen={sidebarOpen}
          onMobileClose={() => setSidebarOpen(false)}
        />
        <main className={cn('flex-1 overflow-auto min-w-0', contentClassName)}>
          {children}
        </main>
      </div>
    </div>
  )
}
