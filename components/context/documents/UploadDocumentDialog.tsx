'use client';

import { useEffect, useRef, useState } from 'react';
import { Database } from '@/lib/supabase/types';
import { useI18n } from '@/components/shared/I18nProvider';
import { uploadDocument, uploadDocumentsBulk } from '@/app/actions/documents';
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
type DocumentFolder =
  Database['public']['Tables']['project_document_folders']['Row'];

interface UploadDocumentDialogProps {
  open: boolean;
  projectId: string;
  folders?: DocumentFolder[];
  /** When opening from inside a folder view, pre-select this folder (null = "Ninguna"). */
  defaultFolderId?: string | null;
  /** Category to pre-select so user can just pick file and upload (e.g. "other"). */
  defaultCategory?: string;
  onClose: () => void;
  /** Called with one file (single upload) or array (bulk upload). */
  onSuccess: (fileOrFiles: ProjectFile | ProjectFile[]) => void;
}

const DEFAULT_CATEGORY = 'other';

export function UploadDocumentDialog({
  open,
  projectId,
  folders = [],
  defaultFolderId,
  defaultCategory = DEFAULT_CATEGORY,
  onClose,
  onSuccess,
}: UploadDocumentDialogProps) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevOpenRef = useRef(false);

  const [file, setFile] = useState<File | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [folderId, setFolderId] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [bulkErrors, setBulkErrors] = useState<
    { name: string; error: string }[]
  >([]);

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setFolderId(defaultFolderId ?? '');
      setCategory(defaultCategory || DEFAULT_CATEGORY);
    }
    prevOpenRef.current = open;
  }, [open, defaultFolderId, defaultCategory]);

  const isBulkMode = files.length > 1;

  const resetForm = () => {
    setFile(null);
    setFiles([]);
    setFileError(null);
    setTitle('');
    setCategory('');
    setFolderId('');
    setDescription('');
    setTags('');
    setIsUploading(false);
    setSubmitError(null);
    setBulkErrors([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    if (isUploading) return;
    resetForm();
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedList = e.target.files ? Array.from(e.target.files) : [];
    setFileError(null);
    setBulkErrors([]);

    if (selectedList.length === 0) {
      setFile(null);
      setFiles([]);
      return;
    }

    const invalid: string[] = [];
    const valid: File[] = [];
    for (const f of selectedList) {
      if (!isValidMimeType(f.type)) {
        invalid.push(f.name);
        continue;
      }
      if (f.size > DOCUMENT_MAX_SIZE_BYTES) {
        invalid.push(f.name);
        continue;
      }
      valid.push(f);
    }
    if (invalid.length > 0) {
      setFileError(
        t('documents.file_type_unsupported') +
          (invalid.length > 0 ? ` (${invalid.join(', ')})` : '')
      );
    }
    if (valid.length === 0) {
      setFile(null);
      setFiles([]);
      return;
    }

    if (valid.length === 1) {
      setFile(valid[0]);
      setFiles([]);
      if (!title) {
        setTitle(valid[0].name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
      }
    } else {
      setFile(null);
      setFiles(valid);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setBulkErrors([]);

    if (isBulkMode) {
      if (files.length === 0) {
        setFileError(t('documents.file_required'));
        return;
      }
      if (!category) {
        setSubmitError(t('documents.category_required'));
        return;
      }
      const formData = new FormData();
      formData.set('document_category', category);
      if (folderId.trim()) formData.set('folder_id', folderId.trim());
      files.forEach((f) => formData.append('file', f));
      setIsUploading(true);
      const result = await uploadDocumentsBulk(projectId, formData);
      setIsUploading(false);
      if (result.errors?.length) {
        setBulkErrors(
          result.errors.map((e) => ({ name: e.name, error: e.error }))
        );
      }
      if (result.data?.length) {
        const created = result.data;
        resetForm();
        onSuccess(created);
      }
      if (!result.data?.length && result.errors?.length) {
        setSubmitError(t('documents.upload_error'));
      }
      return;
    }

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
    if (folderId.trim()) formData.set('folder_id', folderId.trim());
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
            <Label htmlFor="doc-file">
              {isBulkMode
                ? t('documents.bulk_files_label')
                : t('documents.file_label')}
            </Label>
            <Input
              id="doc-file"
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt"
              multiple
              onChange={handleFileChange}
              className="cursor-pointer"
            />
            <p className="text-xs text-muted-foreground">
              {isBulkMode
                ? t('documents.bulk_file_hint')
                : t('documents.file_hint')}
            </p>
            {isBulkMode && files.length > 0 && (
              <ul className="text-xs text-muted-foreground list-disc list-inside max-h-32 overflow-y-auto">
                {files.map((f, i) => (
                  <li key={i}>{f.name}</li>
                ))}
              </ul>
            )}
            {fileError && (
              <p className="text-xs text-destructive">{fileError}</p>
            )}
          </div>

          {/* Title — only in single-file mode */}
          {!isBulkMode && (
            <div className="space-y-1.5">
              <Label htmlFor="doc-title">{t('documents.title_label')}</Label>
              <Input
                id="doc-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('documents.title_placeholder')}
              />
            </div>
          )}

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

          {/* Folder */}
          {folders.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="doc-folder">{t('documents.folder_label')}</Label>
              <Select
                value={folderId || 'none'}
                onValueChange={(v) => setFolderId(v === 'none' ? '' : v)}
              >
                <SelectTrigger id="doc-folder">
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

          {/* Description — only in single-file mode */}
          {!isBulkMode && (
            <>
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
              <div className="space-y-1.5">
                <Label htmlFor="doc-tags">{t('documents.tags_label')}</Label>
                <Input
                  id="doc-tags"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder={t('documents.tags_placeholder')}
                />
              </div>
            </>
          )}

          {bulkErrors.length > 0 && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 space-y-1">
              <p className="text-xs font-medium text-destructive">
                {t('documents.bulk_partial_errors')}
              </p>
              <ul className="text-xs text-destructive list-disc list-inside">
                {bulkErrors.map((e, i) => (
                  <li key={i}>
                    {e.name}: {e.error}
                  </li>
                ))}
              </ul>
            </div>
          )}

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
            <Button
              type="submit"
              disabled={
                isUploading ||
                (!isBulkMode && !file) ||
                (isBulkMode && files.length === 0) ||
                !category
              }
            >
              {isUploading
                ? t('documents.uploading')
                : isBulkMode
                  ? t('documents.bulk_upload')
                  : t('documents.upload')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
