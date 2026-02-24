'use client';

import { useRef, useState } from 'react';
import { Database } from '@/lib/supabase/types';
import { useI18n } from '@/components/shared/I18nProvider';
import { uploadDocument } from '@/app/actions/documents';
import {
  DOCUMENT_CATEGORY_VALUES,
  isValidMimeType,
  DOCUMENT_MAX_SIZE_BYTES,
} from '@/lib/validation/project-documents';
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

interface UploadDocumentDialogProps {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onSuccess: (file: ProjectFile) => void;
}

export function UploadDocumentDialog({
  open,
  projectId,
  onClose,
  onSuccess,
}: UploadDocumentDialogProps) {
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
    if (!isValidMimeType(selected.type)) {
      setFileError(t('documents.file_type_unsupported'));
      setFile(null);
      return;
    }
    if (selected.size > DOCUMENT_MAX_SIZE_BYTES) {
      setFileError(t('documents.file_too_large'));
      setFile(null);
      return;
    }

    setFile(selected);
    // Auto-fill title from filename if empty
    if (!title) {
      setTitle(selected.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!file) {
      setFileError(t('documents.file_required'));
      return;
    }
    if (!category) {
      setSubmitError(t('documents.category_required'));
      return;
    }

    const formData = new FormData();
    formData.set('file', file);
    formData.set('title', title.trim() || file.name.replace(/\.[^.]+$/, ''));
    formData.set('document_category', category);
    formData.set('description', description);
    formData.set('tags', tags);

    setIsUploading(true);
    const result = await uploadDocument(projectId, formData);
    setIsUploading(false);

    if (!result.success || !result.data) {
      setSubmitError(result.error ?? t('documents.upload_error'));
      return;
    }

    resetForm();
    onSuccess(result.data);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('documents.upload')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* File picker */}
          <div className="space-y-1.5">
            <Label htmlFor="doc-file">{t('documents.file_label')}</Label>
            <Input
              id="doc-file"
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt"
              onChange={handleFileChange}
              className="cursor-pointer"
            />
            <p className="text-xs text-muted-foreground">
              {t('documents.file_hint')}
            </p>
            {fileError && (
              <p className="text-xs text-destructive">{fileError}</p>
            )}
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="doc-title">{t('documents.title_label')}</Label>
            <Input
              id="doc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('documents.title_placeholder')}
            />
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label htmlFor="doc-category">
              {t('documents.category_label')}
            </Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="doc-category">
                <SelectValue placeholder={t('documents.select_category')} />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_CATEGORY_VALUES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {t(`documents.category_${cat}` as Parameters<typeof t>[0])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="doc-description">
              {t('documents.description_label')}
            </Label>
            <Textarea
              id="doc-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('documents.description_placeholder')}
              rows={2}
            />
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label htmlFor="doc-tags">{t('documents.tags_label')}</Label>
            <Input
              id="doc-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder={t('documents.tags_placeholder')}
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
            <Button type="submit" disabled={isUploading}>
              {isUploading ? t('documents.uploading') : t('documents.upload')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
