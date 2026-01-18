'use client'

import { Database } from '@/lib/supabase/types'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { Search, LogOut } from 'lucide-react'
import { useState } from 'react'
import { AddProjectModal } from './AddProjectModal'

type Project = Database['public']['Tables']['projects']['Row']

interface TopBarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  onSignOut: () => void
  onProjectAdded: () => void,
  projectName: string
}

export default function TopBar({
  searchQuery,
  onSearchChange,
  onSignOut,
  onProjectAdded,
  projectName,
}: TopBarProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)

  return (
    <>
      <div className="bg-slate-900 text-white shadow-lg h-16 flex items-center justify-between px-6">
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
          <Button
            onClick={() => setIsAddModalOpen(true)}
            variant="default"
            size="sm"
            className="bg-white text-slate-900 hover:bg-slate-100"
          >
            Add Project
          </Button>
          <Button variant="ghost" size="icon" onClick={onSignOut} className="text-white hover:bg-slate-800">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <AddProjectModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onProjectAdded={onProjectAdded}
      />
    </>
  )
}
