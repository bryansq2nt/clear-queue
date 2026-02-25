'use client';

import { useI18n } from '@/components/shared/I18nProvider';
import { Database } from '@/lib/supabase/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FolderOpen } from 'lucide-react';

type NoteFolder = Database['public']['Tables']['project_note_folders']['Row'];

interface MoveNotesToFolderDialogProps {
  open: boolean;
  folders: NoteFolder[];
  selectedCount: number;
  onClose: () => void;
  onMove: (folderId: string | null) => void;
}

export function MoveNotesToFolderDialog({
  open,
  folders,
  selectedCount,
  onClose,
  onMove,
}: MoveNotesToFolderDialogProps) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('notes.move_to_folder_title', { count: selectedCount })}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-1 mt-2">
          <button
            type="button"
            onClick={() => {
              onMove(null);
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
                onMove(folder.id);
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
