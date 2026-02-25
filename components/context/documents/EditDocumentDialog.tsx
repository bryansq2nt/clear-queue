'use client';

import { useEffect, useState } from 'react';
import { Database } from '@/lib/supabase/types';
import { useI18n } from '@/components/shared/I18nProvider';
import { updateDocument } from '@/app/actions/documents';
import { DOCUMENT_CATEGORY_VALUES } from '@/lib/validation/project-documents';
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
type DocumentFolder =
  Database['public']['Tables']['project_document_folders']['Row'];

interface EditDocumentDialogProps {
  open: boolean;
  file: ProjectFile | null;
  folders?: DocumentFolder[];
  onClose: () => void;
  onSuccess: (updated: ProjectFile) => void;
}

export function EditDocumentDialog({
  open,
  file,
  folders = [],
  onClose,
  onSuccess,
}: EditDocumentDialogProps) {
  const { t } = useI18n();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [folderId, setFolderId] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (file) {
      setTitle(file.title);
      setCategory(file.document_category ?? '');
      setFolderId(file.folder_id ?? '');
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
      setSubmitError(t('documents.title_required'));
      return;
    }

    const parsedTags = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    setIsSaving(true);
    const result = await updateDocument(file.id, {
      title: trimmedTitle,
      document_category: category || undefined,
      description: description.trim() || null,
      tags: parsedTags,
      folder_id: folderId.trim() || null,
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
          <DialogTitle>{t('documents.edit_info')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-doc-title">{t('documents.title_label')}</Label>
            <Input
              id="edit-doc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('documents.title_placeholder')}
            />
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-doc-category">
              {t('documents.category_label')}
            </Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="edit-doc-category">
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

          {/* Folder */}
          {folders.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="edit-doc-folder">
                {t('documents.folder_label')}
              </Label>
              <Select
                value={folderId || 'none'}
                onValueChange={(v) => setFolderId(v === 'none' ? '' : v)}
              >
                <SelectTrigger id="edit-doc-folder">
                  <SelectValue placeholder={t('documents.folder_none')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    {t('documents.folder_none')}
                  </SelectItem>
                  {folders.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-doc-description">
              {t('documents.description_label')}
            </Label>
            <Textarea
              id="edit-doc-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('documents.description_placeholder')}
              rows={2}
            />
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-doc-tags">{t('documents.tags_label')}</Label>
            <Input
              id="edit-doc-tags"
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
              disabled={isSaving}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? t('documents.saving') : t('common.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
