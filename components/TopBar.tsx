'use client'

import { Database } from '@/lib/supabase/types'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { Search, LogOut, CheckSquare, FileText } from 'lucide-react'
import { useState } from 'react'
import { AddProjectModal } from './AddProjectModal'
import { EditProjectModal } from './EditProjectModal'

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
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false)

  return (
    <>
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white shadow-xl">
        <div className="px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">{projectName} - Task Board</h1>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-10 bg-slate-800 border-slate-700 text-white placeholder:text-slate-400 w-64"
              />
            </div>
            {onToggleSelectionMode && (
              <Button
                onClick={onToggleSelectionMode}
                variant={selectionMode ? "default" : "outline"}
                size="sm"
                className={selectionMode ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-slate-800 text-white border-slate-700 hover:bg-slate-700"}
              >
                <CheckSquare className="w-4 h-4 mr-2" />
                {selectionMode ? 'Cancel Selection' : 'Select'}
              </Button>
            )}
            {currentProject ? (
              <>
                <Button
                  onClick={() => setIsNotesModalOpen(true)}
                  variant="outline"
                  size="sm"
                  className="bg-slate-800 text-white border-slate-700 hover:bg-slate-700"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Notes
                </Button>
                <Button
                  onClick={() => setIsEditModalOpen(true)}
                  variant="default"
                  size="sm"
                  className="bg-white text-slate-900 hover:bg-slate-100"
                >
                  Edit Project
                </Button>
              </>
            ) : (
              <Button
                onClick={() => setIsAddModalOpen(true)}
                variant="default"
                size="sm"
                className="bg-white text-slate-900 hover:bg-slate-100"
              >
                Add Project
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onSignOut} className="text-white hover:bg-slate-800">
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
