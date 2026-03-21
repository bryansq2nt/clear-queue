'use client';

import { useRef, useState } from 'react';
import { Database } from '@/lib/supabase/types';
import { useI18n } from '@/components/shared/I18nProvider';
import { uploadMedia } from '@/app/actions/media';
import { toastError, toastSuccess } from '@/lib/ui/toast';
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

function defaultTitleFromFileName(name: string): string {
  const base = name
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]/g, ' ')
    .trim();
  return base || name;
}

interface UploadMediaDialogProps {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onSuccess: (files: ProjectFile[]) => void;
}

export function UploadMediaDialog({
  open,
  projectId,
  onClose,
  onSuccess,
}: UploadMediaDialogProps) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileRejectionsHint, setFileRejectionsHint] = useState<string | null>(
    null
  );
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const resetForm = () => {
    setFiles([]);
    setFileError(null);
    setFileRejectionsHint(null);
    setTitle('');
    setCategory('');
    setDescription('');
    setTags('');
    setIsUploading(false);
    setUploadProgress(null);
    setSubmitError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    if (isUploading) return;
    resetForm();
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawList = e.target.files ? Array.from(e.target.files) : [];
    setFileError(null);
    setFileRejectionsHint(null);

    if (rawList.length === 0) {
      setFiles([]);
      return;
    }

    const valid: File[] = [];
    const rejectedNames: string[] = [];

    for (const f of rawList) {
      if (!isValidMediaMimeType(f.type)) {
        rejectedNames.push(f.name);
        continue;
      }
      if (f.size > MEDIA_MAX_SIZE_BYTES) {
        rejectedNames.push(f.name);
        continue;
      }
      valid.push(f);
    }

    if (rejectedNames.length > 0) {
      const preview = rejectedNames.slice(0, 4).join(', ');
      const more =
        rejectedNames.length > 4
          ? ` (+${String(rejectedNames.length - 4)})`
          : '';
      setFileRejectionsHint(
        t('media.files_skipped_hint', {
          count: String(rejectedNames.length),
          names: preview + more,
        })
      );
    }

    setFiles(valid);

    if (valid.length === 1 && !title) {
      setTitle(defaultTitleFromFileName(valid[0].name));
    }
    if (valid.length !== 1) {
      setTitle('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (files.length === 0) {
      setFileError(t('media.file_required'));
      return;
    }
    if (!category) {
      setSubmitError(t('media.category_required'));
      return;
    }

    setIsUploading(true);
    setUploadProgress({ current: 0, total: files.length });

    const uploaded: ProjectFile[] = [];
    const failures: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setUploadProgress({ current: i + 1, total: files.length });

      const formData = new FormData();
      formData.set('file', f);
      const fileTitle =
        files.length === 1 && title.trim()
          ? title.trim()
          : defaultTitleFromFileName(f.name);
      formData.set('title', fileTitle);
      formData.set('media_category', category);
      formData.set('description', description);
      formData.set('tags', tags);

      const result = await uploadMedia(projectId, formData);
      if (!result.success || !result.data) {
        failures.push(
          files.length > 1
            ? `${f.name}: ${result.error ?? t('media.upload_error')}`
            : (result.error ?? t('media.upload_error'))
        );
        continue;
      }
      uploaded.push(result.data);
    }

    setIsUploading(false);
    setUploadProgress(null);

    if (uploaded.length === 0) {
      setSubmitError(failures.join('\n') || t('media.upload_error'));
      return;
    }

    if (failures.length > 0) {
      toastError(
        t('media.bulk_partial_error', {
          ok: String(uploaded.length),
          failed: String(failures.length),
        })
      );
    } else if (uploaded.length > 1) {
      toastSuccess(
        t('media.upload_bulk_success', { count: String(uploaded.length) })
      );
    }

    resetForm();
    onSuccess(uploaded);
  };

  const isMulti = files.length > 1;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('media.upload')}</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="mt-2 flex min-h-0 flex-1 flex-col space-y-4 overflow-y-auto"
        >
          {/* File picker */}
          <div className="space-y-1.5">
            <Label htmlFor="media-file">{t('media.file_label')}</Label>
            <Input
              id="media-file"
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml,video/mp4,video/webm,video/quicktime"
              onChange={handleFileChange}
              className="cursor-pointer"
            />
            <p className="text-xs text-muted-foreground">
              {t('media.file_hint')}
            </p>
            {files.length > 0 && (
              <ul className="max-h-28 overflow-y-auto rounded-md border border-border bg-muted/30 px-2 py-1.5 text-xs text-foreground">
                {files.map((f) => (
                  <li
                    key={`${f.name}-${f.size}-${f.lastModified}`}
                    className="truncate py-0.5"
                  >
                    {f.name}
                  </li>
                ))}
              </ul>
            )}
            {fileError && (
              <p className="text-xs text-destructive">{fileError}</p>
            )}
            {fileRejectionsHint && (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                {fileRejectionsHint}
              </p>
            )}
          </div>

          {/* Title — single file only (multi uses file names) */}
          {!isMulti && (
            <div className="space-y-1.5">
              <Label htmlFor="media-title">{t('media.title_label')}</Label>
              <Input
                id="media-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('media.title_placeholder')}
              />
            </div>
          )}
          {isMulti && (
            <p className="text-xs text-muted-foreground">
              {t('media.title_bulk_hint')}
            </p>
          )}

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
            {isMulti && (
              <p className="text-xs text-muted-foreground">
                {t('media.metadata_applies_to_all')}
              </p>
            )}
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
            <p className="text-sm text-destructive whitespace-pre-wrap">
              {submitError}
            </p>
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
            <Button
              type="submit"
              disabled={isUploading || files.length === 0 || !category}
            >
              {isUploading && uploadProgress
                ? t('media.uploading_progress', {
                    current: String(uploadProgress.current),
                    total: String(uploadProgress.total),
                  })
                : isUploading
                  ? t('media.uploading')
                  : t('media.upload')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
