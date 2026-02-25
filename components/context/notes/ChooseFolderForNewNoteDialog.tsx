'use client';

import { useI18n } from '@/components/shared/I18nProvider';
import { Database } from '@/lib/supabase/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FolderOpen } from 'lucide-react';

type NoteFolder = Database['public']['Tables']['project_note_folders']['Row'];

interface ChooseFolderForNewNoteDialogProps {
  open: boolean;
  folders: NoteFolder[];
  onClose: () => void;
  onChoose: (folderId: string | null) => void;
}

/**
 * When creating a new note from the folder grid (no folder selected),
 * user must choose a folder first. Options: "No folder" + each folder.
 */
export function ChooseFolderForNewNoteDialog({
  open,
  folders,
  onClose,
  onChoose,
}: ChooseFolderForNewNoteDialogProps) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('notes.choose_folder_for_new_note')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 mt-2">
          <button
            type="button"
            onClick={() => {
              onChoose(null);
              onClose();
            }}
            className="w-full flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3 text-left hover:bg-muted/50 transition-colors"
          >
            <FolderOpen className="h-5 w-5 text-muted-foreground shrink-0" />
            <span className="font-medium">{t('notes.folder_no_folder')}</span>
          </button>
          {folders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              onClick={() => {
                onChoose(folder.id);
                onClose();
              }}
              className="w-full flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3 text-left hover:bg-muted/50 transition-colors"
            >
              <FolderOpen className="h-5 w-5 text-muted-foreground shrink-0" />
              <span className="font-medium truncate">{folder.name}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
