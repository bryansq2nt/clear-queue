'use client';

import { useState } from 'react';
import { useI18n } from '@/components/shared/I18nProvider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface MutationErrorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: string;
  onTryAgain: () => void | Promise<void>;
  onCancel: () => void;
}

export function MutationErrorDialog({
  open,
  onOpenChange,
  title,
  message,
  onTryAgain,
  onCancel,
}: MutationErrorDialogProps) {
  const { t } = useI18n();
  const [isRetrying, setIsRetrying] = useState(false);

  async function handleTryAgain() {
    setIsRetrying(true);
    try {
      await Promise.resolve(onTryAgain());
      onOpenChange(false);
    } finally {
      setIsRetrying(false);
    }
  }

  function handleCancel() {
    onCancel();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={handleCancel}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={handleTryAgain} disabled={isRetrying}>
            {isRetrying ? t('common.loading') : t('mutation_error.try_again')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
