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

interface DeleteDocumentsConfirmDialogProps {
  open: boolean;
  /** Number of documents about to be deleted */
  documentCount: number;
  /** True when every document in the current folder view is selected */
  isAllDocsInFolder: boolean;
  /** True while the caller is running the delete server action */
  isDeleting: boolean;
  /** Called when the user completes both confirmation steps */
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Two-step confirmation dialog for bulk document deletion.
 *
 * Step 1 — warns that documents will be permanently deleted.
 *           If every document in the folder is selected, an additional banner
 *           makes the scope unmistakably clear.
 * Step 2 — final irreversible-action confirmation with a destructive button.
 */
export function DeleteDocumentsConfirmDialog({
  open,
  documentCount,
  isAllDocsInFolder,
  isDeleting,
  onConfirm,
  onCancel,
}: DeleteDocumentsConfirmDialogProps) {
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
                {t('documents.delete_docs_title', { count: documentCount })}
              </DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-2 pt-1">
                  <p>{t('documents.delete_docs_warning')}</p>
                  {isAllDocsInFolder && (
                    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{t('documents.delete_docs_all_warning')}</span>
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
                {t('documents.delete_docs_continue')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {t('documents.delete_docs_final_title')}
              </DialogTitle>
              <DialogDescription>
                {t('documents.delete_docs_final_message', {
                  count: documentCount,
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
                  ? t('documents.delete_docs_deleting')
                  : t('documents.delete_docs_confirm')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
