'use client';

import { useState } from 'react';
import { Database } from '@/lib/supabase/types';
import { useI18n } from '@/components/shared/I18nProvider';
import { createFolder } from '@/app/actions/note-folders';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type NoteFolder = Database['public']['Tables']['project_note_folders']['Row'];

interface CreateFolderDialogProps {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onSuccess: (folder: NoteFolder) => void;
}

export function CreateFolderDialog({
  open,
  projectId,
  onClose,
  onSuccess,
}: CreateFolderDialogProps) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    if (isSubmitting) return;
    setName('');
    setError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) return;
    setIsSubmitting(true);
    const result = await createFolder(projectId, trimmed);
    setIsSubmitting(false);
    if (!result.success || !result.data) {
      setError(result.error ?? 'Failed to create folder');
      return;
    }
    setName('');
    onSuccess(result.data);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('notes.new_folder')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="note-folder-name">
              {t('notes.folder_name_placeholder')}
            </Label>
            <Input
              id="note-folder-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('notes.folder_name_placeholder')}
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting || !name.trim()}>
              {t('notes.create_folder')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
