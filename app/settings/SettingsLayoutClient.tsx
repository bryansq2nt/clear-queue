'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/types'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import { signOut } from '@/app/actions/auth'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

type Project = Database['public']['Tables']['projects']['Row']

export default function SettingsLayoutClient({
  children,
}: {
  children: React.ReactNode
}) {
  const [projects, setProjects] = useState<Project[]>([])
  const pathname = usePathname()
  const supabase = createClient()

  const loadProjects = useCallback(async () => {
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: true })
    if (data) setProjects(data as Project[])
  }, [supabase])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  return (
    <div className="flex flex-col h-screen bg-background">
      <TopBar
        searchQuery=""
        onSearchChange={() => {}}
        onSignOut={() => signOut()}
        onProjectAdded={loadProjects}
        onProjectUpdated={loadProjects}
        projectName="Settings"
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
        <main className="flex-1 overflow-y-auto flex flex-col">
          <div className="border-b border-border bg-card px-6">
            <nav className="flex gap-6">
              <Link
                href="/settings/profile"
                className={cn(
                  'py-4 text-sm font-medium border-b-2 -mb-px transition-colors',
                  pathname === '/settings/profile'
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                Profile
              </Link>
              <Link
                href="/settings/appearance"
                className={cn(
                  'py-4 text-sm font-medium border-b-2 -mb-px transition-colors',
                  pathname === '/settings/appearance'
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                Appearance
              </Link>
            </nav>
          </div>
          <div className="flex-1">{children}</div>
        </main>
      </div>
    </div>
  )
}
