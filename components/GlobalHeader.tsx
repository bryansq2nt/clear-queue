'use client'

import Link from 'next/link'
import { Menu, ArrowLeft } from 'lucide-react'
import { useI18n } from '@/components/I18nProvider'
import { cn } from '@/lib/utils'

export interface GlobalHeaderProps {
  /** Page title */
  title: string
  /** If set, show back link instead of menu button */
  backHref?: string
  backLabel?: string
  /** If set and no backHref, show menu button to open sidebar (mobile + desktop) */
  onOpenSidebar?: () => void
  /** Optional right-side action (icon button or custom node) */
  rightAction?: React.ReactNode
}

/**
 * Global app header: title, left action (back or sidebar menu), optional right action.
 * Mobile-first, no search / add project / logout.
 */
export function GlobalHeader({
  title,
  backHref,
  backLabel,
  onOpenSidebar,
  rightAction,
}: GlobalHeaderProps) {
  const { t } = useI18n()

  return (
    <header className="bg-primary text-primary-foreground shadow flex-shrink-0">
      <div className="px-4 md:px-6 py-3 md:py-4 flex items-center gap-2 min-w-0">
        {backHref != null && backLabel != null ? (
          <Link
            href={backHref}
            className="flex-shrink-0 inline-flex items-center gap-1.5 text-sm text-primary-foreground/90 hover:text-primary-foreground py-1 pr-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline truncate max-w-[120px]">{backLabel}</span>
          </Link>
        ) : onOpenSidebar != null ? (
          <button
            type="button"
            onClick={onOpenSidebar}
            className="md:hidden flex-shrink-0 p-2 rounded-lg hover:bg-primary-foreground/10 focus:outline-none focus:ring-2 focus:ring-primary-foreground/50"
            aria-label={t('sidebar.navigation')}
          >
            <Menu className="w-5 h-5" />
          </button>
        ) : null}
        <h1 className="text-base md:text-xl font-bold truncate min-w-0 flex-1">
          {title}
        </h1>
        {rightAction != null ? (
          <div className="flex items-center flex-shrink-0">
            {rightAction}
          </div>
        ) : null}
      </div>
    </header>
  )
}
