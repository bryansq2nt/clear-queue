'use client';

import { useRef, useState } from 'react';
import { Database } from '@/lib/supabase/types';
import { useI18n } from '@/components/shared/I18nProvider';
import { uploadMedia } from '@/app/actions/media';
import {
  MEDIA_CATEGORY_VALUES,
  MEDIA_MAX_SIZE_BYTES,
  isValidMediaMimeType,
} from '@/lib/validation/project-media';
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

interface UploadMediaDialogProps {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onSuccess: (file: ProjectFile) => void;
}

export function UploadMediaDialog({
  open,
  projectId,
  onClose,
  onSuccess,
}: UploadMediaDialogProps) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const resetForm = () => {
    setFile(null);
    setFileError(null);
    setTitle('');
    setCategory('');
    setDescription('');
    setTags('');
    setIsUploading(false);
    setSubmitError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    if (isUploading) return;
    resetForm();
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    setFileError(null);

    if (!selected) {
      setFile(null);
      return;
    }
    if (!isValidMediaMimeType(selected.type)) {
      setFileError(t('media.file_type_unsupported'));
      setFile(null);
      return;
    }
    if (selected.size > MEDIA_MAX_SIZE_BYTES) {
      setFileError(t('media.file_too_large'));
      setFile(null);
      return;
    }
    setFile(selected);
    if (!title) {
      setTitle(selected.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!file) {
      setFileError(t('media.file_required'));
      return;
    }
    if (!category) {
      setSubmitError(t('media.category_required'));
      return;
    }

    const formData = new FormData();
    formData.set('file', file);
    formData.set('title', title.trim() || file.name.replace(/\.[^.]+$/, ''));
    formData.set('media_category', category);
    formData.set('description', description);
    formData.set('tags', tags);

    setIsUploading(true);
    const result = await uploadMedia(projectId, formData);
    setIsUploading(false);

    if (!result.success || !result.data) {
      setSubmitError(result.error ?? t('media.upload_error'));
      return;
    }

    resetForm();
    onSuccess(result.data);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('media.upload')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-2 space-y-4">
          {/* File picker */}
          <div className="space-y-1.5">
            <Label htmlFor="media-file">{t('media.file_label')}</Label>
            <Input
              id="media-file"
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml,video/mp4,video/webm,video/quicktime"
              onChange={handleFileChange}
              className="cursor-pointer"
            />
            <p className="text-xs text-muted-foreground">
              {t('media.file_hint')}
            </p>
            {fileError && (
              <p className="text-xs text-destructive">{fileError}</p>
            )}
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="media-title">{t('media.title_label')}</Label>
            <Input
              id="media-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('media.title_placeholder')}
            />
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label htmlFor="media-category">{t('media.category_label')}</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="media-category">
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
            <Label htmlFor="media-description">
              {t('media.description_label')}
            </Label>
            <Textarea
              id="media-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('media.description_placeholder')}
              rows={2}
            />
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label htmlFor="media-tags">{t('media.tags_label')}</Label>
            <Input
              id="media-tags"
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
              disabled={isUploading}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isUploading || !file || !category}>
              {isUploading ? t('media.uploading') : t('media.upload')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
