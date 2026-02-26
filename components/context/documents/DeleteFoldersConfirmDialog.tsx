'use client';

import { useState } from 'react';
import { useI18n } from '@/components/shared/I18nProvider';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface DeleteFoldersConfirmDialogProps {
  open: boolean;
  /** Number of folders about to be deleted */
  folderCount: number;
  /** True when every named folder in the project is selected */
  isAllFolders: boolean;
  /** True while the caller is running the delete server action */
  isDeleting: boolean;
  /** Called when the user completes both confirmation steps */
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Two-step confirmation dialog for bulk document-folder deletion.
 *
 * Step 1 — warns the user that documents will be moved to "No folder".
 *           If every folder is selected, an additional "all folders" warning
 *           is shown.
 * Step 2 — final irreversible-action confirmation with a destructive button.
 */
export function DeleteFoldersConfirmDialog({
  open,
  folderCount,
  isAllFolders,
  isDeleting,
  onConfirm,
  onCancel,
}: DeleteFoldersConfirmDialogProps) {
  const { t } = useI18n();
  const [step, setStep] = useState<1 | 2>(1);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setStep(1);
      onCancel();
    }
  };

  const handleCancel = () => {
    setStep(1);
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {step === 1 ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {t('documents.delete_folders_title', { count: folderCount })}
              </DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-2 pt-1">
                  <p>{t('documents.delete_folders_docs_warning')}</p>
                  {isAllFolders && (
                    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{t('documents.delete_folders_all_warning')}</span>
                    </div>
                  )}
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={handleCancel}>
                {t('common.cancel')}
              </Button>
              <Button onClick={() => setStep(2)}>
                {t('documents.delete_folders_continue')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {t('documents.delete_folders_final_title')}
              </DialogTitle>
              <DialogDescription>
                {t('documents.delete_folders_final_message', {
                  count: folderCount,
                })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={isDeleting}
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={onConfirm}
                disabled={isDeleting}
              >
                {isDeleting
                  ? t('documents.delete_folders_deleting')
                  : t('documents.delete_folders_confirm')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
