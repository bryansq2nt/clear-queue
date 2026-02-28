'use client';

import { useEffect, useState } from 'react';
import { Database } from '@/lib/supabase/types';
import { useI18n } from '@/components/shared/I18nProvider';
import { updateMedia } from '@/app/actions/media';
import { MEDIA_CATEGORY_VALUES } from '@/lib/validation/project-media';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type ProjectFile = Database['public']['Tables']['project_files']['Row'];

interface EditMediaDialogProps {
  open: boolean;
  file: ProjectFile | null;
  onClose: () => void;
  onSuccess: (updated: ProjectFile) => void;
}

export function EditMediaDialog({
  open,
  file,
  onClose,
  onSuccess,
}: EditMediaDialogProps) {
  const { t } = useI18n();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (file) {
      setTitle(file.title);
      setCategory(file.media_category ?? '');
      setDescription(file.description ?? '');
      setTags((file.tags ?? []).join(', '));
      setSubmitError(null);
    }
  }, [file]);

  const handleClose = () => {
    if (isSaving) return;
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setSubmitError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setSubmitError(t('media.title_required'));
      return;
    }

    const parsedTags = tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    setIsSaving(true);
    const result = await updateMedia(file.id, {
      title: trimmedTitle,
      media_category: category || undefined,
      description: description.trim() || null,
      tags: parsedTags,
    });
    setIsSaving(false);

    if (!result.success || !result.data) {
      setSubmitError(result.error ?? t('common.error'));
      return;
    }

    onSuccess(result.data);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('media.edit_info')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-2 space-y-4">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-media-title">{t('media.title_label')}</Label>
            <Input
              id="edit-media-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('media.title_placeholder')}
            />
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-media-category">
              {t('media.category_label')}
            </Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="edit-media-category">
                <SelectValue placeholder={t('media.select_category')} />
              </SelectTrigger>
              <SelectContent>
                {MEDIA_CATEGORY_VALUES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {t(`media.category_${cat}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-media-description">
              {t('media.description_label')}
            </Label>
            <Textarea
              id="edit-media-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('media.description_placeholder')}
              rows={2}
            />
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-media-tags">{t('media.tags_label')}</Label>
            <Input
              id="edit-media-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder={t('media.tags_placeholder')}
            />
          </div>

          {submitError && (
            <p className="text-sm text-destructive">{submitError}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSaving}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? t('media.saving') : t('common.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
