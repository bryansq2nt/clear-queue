'use client'

import { useState } from 'react'
import { Button } from './ui/button'
import { Trash2, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'

interface SelectionActionBarProps {
  selectedCount: number
  onDelete: () => void
  onCancel: () => void
  isDeleting?: boolean
}

export function SelectionActionBar({ selectedCount, onDelete, onCancel, isDeleting = false }: SelectionActionBarProps) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)

  function handleDeleteClick() {
    setShowConfirmDialog(true)
  }

  function handleConfirmDelete() {
    setShowConfirmDialog(false)
    onDelete()
  }

  if (selectedCount === 0) return null

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-lg z-50">
        <div className="px-6 py-4 flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-slate-700">
              {selectedCount} {selectedCount === 1 ? 'task' : 'tasks'} selected
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={isDeleting}
            >
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteClick}
              disabled={isDeleting || selectedCount === 0}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Selected
            </Button>
          </div>
        </div>
      </div>
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedCount} {selectedCount === 1 ? 'task' : 'tasks'}?</DialogTitle>
            <DialogDescription>This can't be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
