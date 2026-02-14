'use client'

import Link from 'next/link'
import { useI18n } from '@/components/I18nProvider'
import { FileText, Lightbulb, CheckSquare, Receipt, ChevronDown, PanelRightClose } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { getProjectResources, type ProjectResources } from '@/app/projects/actions'
import { cn } from '@/lib/utils'

interface ProjectResourcesPanelProps {
  projectId: string
  projectName?: string
  onCollapse?: () => void
}

export function ProjectResourcesPanel({ projectId, projectName, onCollapse }: ProjectResourcesPanelProps) {
  const { t } = useI18n()
  const [data, setData] = useState<ProjectResources | null>(null)
  const [loading, setLoading] = useState(false)
  const [openSection, setOpenSection] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const res = await getProjectResources(projectId)
      setData(res)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

  const toggle = (key: string) => {
    setOpenSection((prev) => (prev === key ? null : key))
  }

  const sections = [
    {
      key: 'budgets',
      label: t('sidebar.budgets'),
      icon: Receipt,
      items: data?.budgets ?? [],
      emptyLabel: t('resources.no_budgets'),
      getHref: (id: string) => `/budgets/${id}`,
      getLabel: (item: { id: string; name: string }) => item.name,
      ariaOpen: t('resources.open_budget'),
    },
    {
      key: 'notes',
      label: t('sidebar.notes'),
      icon: FileText,
      items: data?.notes ?? [],
      emptyLabel: t('resources.no_notes'),
      getHref: (id: string) => `/notes/${id}`,
      getLabel: (item: { id: string; title: string }) => item.title,
      ariaOpen: t('resources.open_note'),
    },
    {
      key: 'boards',
      label: t('sidebar.idea_graph'),
      icon: Lightbulb,
      items: data?.boards ?? [],
      emptyLabel: t('resources.no_ideas'),
      getHref: (id: string) => `/ideas/boards/${id}`,
      getLabel: (item: { id: string; name: string }) => item.name,
      ariaOpen: t('resources.open_board'),
    },
    {
      key: 'todoLists',
      label: t('sidebar.todo_list'),
      icon: CheckSquare,
      items: data?.todoLists ?? [],
      emptyLabel: t('resources.no_todo_lists'),
      getHref: (id: string) => `/todo/list/${id}`,
      getLabel: (item: { id: string; title: string }) => item.title,
      ariaOpen: t('resources.open_list'),
    },
  ]

  return (
    <div className="w-80 bg-card border-l border-border flex flex-col overflow-hidden flex-shrink-0">
      <div className="p-4 border-b border-border flex-shrink-0 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">{t('resources.title')}</h2>
        </div>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground flex-shrink-0"
            aria-label={t('sidebar.collapse')}
            title={t('sidebar.collapse')}
          >
            <PanelRightClose className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {t('common.loading')}
          </div>
        ) : (
          <div className="space-y-1">
            {sections.map(({ key, label, icon: Icon, items, emptyLabel, getHref, getLabel, ariaOpen }) => (
              <div key={key} className="rounded-lg border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  className="w-full flex items-center justify-between gap-3 p-3 bg-card hover:bg-accent transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <span className="font-medium text-foreground">{label}</span>
                    {items.length > 0 && (
                      <span className="text-xs text-muted-foreground">({items.length})</span>
                    )}
                  </div>
                  <ChevronDown
                    className={cn(
                      'w-5 h-5 flex-shrink-0 text-muted-foreground transition-transform',
                      openSection === key && 'rotate-180'
                    )}
                  />
                </button>
                {openSection === key && (
                  <div className="border-t border-border bg-muted/30 max-h-48 overflow-y-auto">
                    {items.length === 0 ? (
                      <p className="p-3 text-sm text-muted-foreground">{emptyLabel}</p>
                    ) : (
                      <ul className="py-1">
                        {items.map((item) => (
                          <li key={item.id}>
                            <Link
                              href={getHref(item.id)}
                              className="block px-3 py-2.5 text-sm text-foreground hover:bg-accent truncate"
                              title={ariaOpen}
                            >
                              {getLabel(item as any)}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
