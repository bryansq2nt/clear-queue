import { Database } from '@/lib/supabase/types'

type TaskStatus = Database['public']['Tables']['tasks']['Row']['status']

export interface StatusCardStyles {
  bg: string
  border: string
  hover: string
}

export interface StatusColumnStyles {
  bg: string
  border: string
}

/**
 * Get card styling classes based on task status
 */
export function getStatusCardClasses(status: TaskStatus): StatusCardStyles {
  const styles: Record<TaskStatus, StatusCardStyles> = {
    backlog: {
      bg: 'bg-slate-50',
      border: 'border-slate-200',
      hover: 'hover:bg-slate-100/70',
    },
    next: {
      bg: 'bg-blue-50/70',
      border: 'border-blue-200',
      hover: 'hover:bg-blue-50',
    },
    in_progress: {
      bg: 'bg-amber-50/70',
      border: 'border-amber-200',
      hover: 'hover:bg-amber-50',
    },
    blocked: {
      bg: 'bg-red-50/70',
      border: 'border-red-200',
      hover: 'hover:bg-red-50',
    },
    done: {
      bg: 'bg-emerald-50/70',
      border: 'border-emerald-200',
      hover: 'hover:bg-emerald-50',
    },
  }

  return styles[status] || styles.backlog
}

/**
 * Get column container styling classes based on task status
 */
export function getStatusColumnClasses(status: TaskStatus): StatusColumnStyles {
  const styles: Record<TaskStatus, StatusColumnStyles> = {
    backlog: {
      bg: 'bg-slate-50/40',
      border: 'border-slate-200',
    },
    next: {
      bg: 'bg-blue-50/30',
      border: 'border-blue-200/50',
    },
    in_progress: {
      bg: 'bg-amber-50/30',
      border: 'border-amber-200/50',
    },
    blocked: {
      bg: 'bg-red-50/30',
      border: 'border-red-200/50',
    },
    done: {
      bg: 'bg-emerald-50/30',
      border: 'border-emerald-200/50',
    },
  }

  return styles[status] || styles.backlog
}
