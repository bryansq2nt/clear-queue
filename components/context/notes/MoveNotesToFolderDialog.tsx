'use client';

import { useState } from 'react';
import { useI18n } from '@/components/shared/I18nProvider';
import { Database } from '@/lib/supabase/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FolderOpen, FolderPlus } from 'lucide-react';
import { CreateFolderDialog } from './CreateFolderDialog';

type NoteFolder = Database['public']['Tables']['project_note_folders']['Row'];

interface MoveNotesToFolderDialogProps {
  open: boolean;
  folders: NoteFolder[];
  selectedCount: number;
  projectId: string;
  /** Current folder id (excluded from destination list). 'root' = no folder, null = not in folder view */
  currentFolderId: string | null;
  onClose: () => void;
  onMove: (folderId: string | null) => void;
  onFolderCreated: (folder: NoteFolder) => void;
}

export function MoveNotesToFolderDialog({
  open,
  folders,
  selectedCount,
  projectId,
  currentFolderId,
  onClose,
  onMove,
  onFolderCreated,
}: MoveNotesToFolderDialogProps) {
  const { t } = useI18n();
  const [showCreateFolder, setShowCreateFolder] = useState(false);

  const handleCreateSuccess = (folder: NoteFolder) => {
    onFolderCreated(folder);
    setShowCreateFolder(false);
    onMove(folder.id);
    onClose();
  };

  const destinationFolders = folders.filter(
    (f) =>
      currentFolderId === null ||
      currentFolderId === 'root' ||
      f.id !== currentFolderId
  );

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('notes.move_to_folder_title', { count: selectedCount })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1 mt-2">
            {currentFolderId !== 'root' && (
              <button
                type="button"
                onClick={() => {
                  onMove(null);
                  onClose();
                }}
                className="w-full flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3 text-left hover:bg-muted/50 transition-colors"
              >
                <FolderOpen className="h-5 w-5 text-muted-foreground shrink-0" />
                <span className="font-medium">
                  {t('notes.folder_no_folder')}
                </span>
              </button>
            )}
            {destinationFolders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                onClick={() => {
                  onMove(folder.id);
                  onClose();
                }}
                className="w-full flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3 text-left hover:bg-muted/50 transition-colors"
              >
                <FolderOpen className="h-5 w-5 text-muted-foreground shrink-0" />
                <span className="font-medium truncate">{folder.name}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowCreateFolder(true)}
              className="w-full flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 p-3 text-left text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
            >
              <FolderPlus className="h-5 w-5 shrink-0" />
              <span className="font-medium">{t('notes.new_folder')}</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <CreateFolderDialog
        open={showCreateFolder}
        projectId={projectId}
        onClose={() => setShowCreateFolder(false)}
        onSuccess={handleCreateSuccess}
      />
    </>
  );
}
