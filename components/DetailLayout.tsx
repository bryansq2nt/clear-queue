'use client'

import { signOut } from '@/app/actions/auth'
import { cn } from '@/lib/utils'
import TopBar from './TopBar'

interface DetailLayoutProps {
  /** e.g. /budgets, /clients */
  backHref: string
  /** i18n key or text for back link */
  backLabel: string
  /** Page title shown in header */
  title: string
  children: React.ReactNode
  /** Optional class for main content area (e.g. p-4 sm:p-6 max-w-7xl mx-auto) */
  contentClassName?: string
  /** Optional actions (Edit, Delete, etc.) shown in header */
  actions?: React.ReactNode
}

/**
 * Full-height layout for singular/detail views: no Sidebar, only TopBar with back button + title.
 * Mobile-friendly and responsive.
 */
export function DetailLayout({ backHref, backLabel, title, children, contentClassName, actions }: DetailLayoutProps) {
  return (
    <div className="flex flex-col h-screen bg-background">
      <TopBar
        backHref={backHref}
        backLabel={backLabel}
        projectName={title}
        actions={actions}
        searchQuery=""
        onSearchChange={() => {}}
        onSignOut={() => signOut()}
        onProjectAdded={() => {}}
        onProjectUpdated={() => {}}
      />
      <main className={cn('flex-1 overflow-y-auto min-h-0', contentClassName)}>
        {children}
      </main>
    </div>
  )
}
