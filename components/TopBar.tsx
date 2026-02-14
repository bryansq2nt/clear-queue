'use client'

import { Database } from '@/lib/supabase/types'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { Search, LogOut, CheckSquare, FileText } from 'lucide-react'
import { useState } from 'react'
import { AddProjectModal } from './AddProjectModal'
import { EditProjectModal } from './EditProjectModal'
import { useI18n } from '@/components/I18nProvider'

type Project = Database['public']['Tables']['projects']['Row']

interface TopBarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  onSignOut: () => void
  onProjectAdded: () => void
  onProjectUpdated: () => void
  projectName: string
  currentProject?: Project | null
  selectionMode?: boolean
  onToggleSelectionMode?: () => void
}

export default function TopBar({
  searchQuery,
  onSearchChange,
  onSignOut,
  onProjectAdded,
  onProjectUpdated,
  projectName,
  currentProject,
  selectionMode = false,
  onToggleSelectionMode,
}: TopBarProps) {
  const { t } = useI18n()
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false)

  return (
    <>
      <div className="bg-primary text-primary-foreground shadow-xl">
        <div className="px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">{projectName} - {t('topbar.task_board')}</h1>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-primary-foreground/70" />
              <Input
                placeholder={t('topbar.search_tasks')}
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-10 bg-primary/80 border-primary-foreground/20 text-primary-foreground placeholder:text-primary-foreground/60 w-64"
              />
            </div>
            {onToggleSelectionMode && (
              <Button
                onClick={onToggleSelectionMode}
                variant={selectionMode ? "default" : "outline"}
                size="sm"
                className={selectionMode ? "bg-primary-foreground text-primary hover:bg-primary-foreground/90" : "bg-primary/80 text-primary-foreground border-primary-foreground/30 hover:bg-primary/90"}
              >
                <CheckSquare className="w-4 h-4 mr-2" />
                {selectionMode ? t('topbar.cancel_selection') : t('topbar.select')}
              </Button>
            )}
            {currentProject ? (
              <>
                <Button
                  onClick={() => setIsNotesModalOpen(true)}
                  variant="outline"
                  size="sm"
                  className="bg-primary/80 text-primary-foreground border-primary-foreground/30 hover:bg-primary/90"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  {t('sidebar.notes')}
                </Button>
                <Button
                  onClick={() => setIsEditModalOpen(true)}
                  variant="default"
                  size="sm"
                  className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
                >
                  {t('topbar.edit_project')}
                </Button>
              </>
            ) : (
              <Button
                onClick={() => setIsAddModalOpen(true)}
                variant="default"
                size="sm"
                className="bg-white text-slate-900 hover:bg-slate-100"
              >
                {t('topbar.add_project')}
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => onSignOut()} className="text-primary-foreground hover:bg-primary/80">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
      {currentProject ? (
        <>
          <EditProjectModal
            isOpen={isEditModalOpen}
            onClose={() => setIsEditModalOpen(false)}
            onProjectUpdated={() => {
              onProjectUpdated()
              setIsEditModalOpen(false)
            }}
            project={currentProject}
            defaultTab="details"
          />
          <EditProjectModal
            isOpen={isNotesModalOpen}
            onClose={() => setIsNotesModalOpen(false)}
            onProjectUpdated={() => {
              onProjectUpdated()
            }}
            project={currentProject}
            defaultTab="notes"
          />
        </>
      ) : (
        <AddProjectModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onProjectAdded={onProjectAdded}
        />
      )}
    </>
  )
}
