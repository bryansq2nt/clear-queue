'use client';

import { useState } from 'react';
import { Database } from '@/lib/supabase/types';
import { useI18n } from '@/components/shared/I18nProvider';
import { cn } from '@/lib/utils';
import {
  getDocumentSignedUrl,
  getDocumentDownloadUrl,
  touchDocument,
  markDocumentFinal,
} from '@/app/actions/documents';
import {
  MoreVertical,
  FileText,
  FileSpreadsheet,
  FileType,
  Presentation,
  Edit,
  Archive,
  Download,
  Trash2,
  CheckCircle2,
  Circle,
  Loader2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type ProjectFile = Database['public']['Tables']['project_files']['Row'];

const EXT_ICON_MAP: Record<string, React.ElementType> = {
  pdf: FileText,
  doc: FileType,
  docx: FileType,
  xls: FileSpreadsheet,
  xlsx: FileSpreadsheet,
  csv: FileSpreadsheet,
  ppt: Presentation,
  pptx: Presentation,
  txt: FileText,
};

const EXT_COLOR_MAP: Record<string, string> = {
  pdf: 'text-red-500',
  doc: 'text-blue-500',
  docx: 'text-blue-500',
  xls: 'text-green-500',
  xlsx: 'text-green-500',
  csv: 'text-green-600',
  ppt: 'text-orange-500',
  pptx: 'text-orange-500',
  txt: 'text-muted-foreground',
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale === 'es' ? 'es-MX' : 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface DocumentRowProps {
  file: ProjectFile;
  onEdit: (file: ProjectFile) => void;
  onArchive: (file: ProjectFile) => void;
  onDelete: (file: ProjectFile) => void;
  onFinalToggle: (file: ProjectFile, isFinal: boolean) => void;
}

export function DocumentRow({
  file,
  onEdit,
  onArchive,
  onDelete,
  onFinalToggle,
}: DocumentRowProps) {
  const { t, locale } = useI18n();
  const [isOpening, setIsOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isFinalPending, setIsFinalPending] = useState(false);

  const ext = file.file_ext ?? 'txt';
  const Icon = EXT_ICON_MAP[ext] ?? FileText;
  const iconColor = EXT_COLOR_MAP[ext] ?? 'text-muted-foreground';

  const handleOpen = async () => {
    if (isOpening) return;
    setOpenError(null);

    // Open a blank window synchronously while still inside the user gesture.
    // Mobile browsers (iOS Safari) block window.open() called after an await
    // because the browser gesture context is lost at that point.
    const newWindow = window.open('', '_blank', 'noopener,noreferrer');

    setIsOpening(true);
    const { url, error } = await getDocumentSignedUrl(file.id);
    setIsOpening(false);

    if (error || !url) {
      newWindow?.close();
      setOpenError(t('documents.error_opening'));
      return;
    }

    if (newWindow) {
      newWindow.location.href = url;
    }
    // fire-and-forget
    touchDocument(file.id);
  };

  const handleDownload = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    const { url, error } = await getDocumentDownloadUrl(file.id);
    setIsDownloading(false);
    if (error || !url) return;
    const a = document.createElement('a');
    a.href = url;
    a.click();
  };

  const handleFinalToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFinalPending) return;
    setIsFinalPending(true);
    await markDocumentFinal(file.id, !file.is_final);
    onFinalToggle(file, !file.is_final);
    setIsFinalPending(false);
  };

  const categoryKey =
    `documents.category_${file.document_category ?? 'other'}` as const;

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 min-h-[56px] hover:bg-muted/30 transition-colors group">
      {/* File type icon */}
      <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
        <Icon className={cn('w-6 h-6', iconColor)} />
      </div>

      {/* Title + category */}
      <div className="flex-1 min-w-0">
        <button
          type="button"
          onClick={handleOpen}
          disabled={isOpening}
          className="text-left w-full"
          aria-label={t('documents.open_document')}
        >
          <span className="flex items-center gap-2">
            <span className="text-sm font-medium truncate hover:underline cursor-pointer">
              {file.title}
            </span>
            {file.is_final && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 flex-shrink-0">
                {t('documents.final_badge')}
              </span>
            )}
            {isOpening && (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground flex-shrink-0" />
            )}
          </span>
        </button>
        {openError && (
          <p className="text-xs text-destructive mt-0.5">{openError}</p>
        )}
        <p className="text-xs text-muted-foreground mt-0.5">{t(categoryKey)}</p>
      </div>

      {/* Size + date (hidden on mobile) */}
      <div className="hidden sm:flex flex-col items-end gap-0.5 flex-shrink-0 text-xs text-muted-foreground">
        <span>{formatFileSize(file.size_bytes)}</span>
        <span>{formatDate(file.created_at, locale)}</span>
      </div>

      {/* Final toggle */}
      <button
        type="button"
        onClick={handleFinalToggle}
        disabled={isFinalPending}
        title={
          file.is_final
            ? t('documents.unmark_final')
            : t('documents.mark_final')
        }
        className="flex-shrink-0 p-1.5 rounded hover:bg-muted transition-colors"
        aria-label={
          file.is_final
            ? t('documents.unmark_final')
            : t('documents.mark_final')
        }
      >
        {isFinalPending ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : file.is_final ? (
          <CheckCircle2 className="w-4 h-4 text-green-500" />
        ) : (
          <Circle className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </button>

      {/* Overflow menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex-shrink-0 p-1.5 rounded hover:bg-muted transition-colors"
            aria-label={t('common.menu')}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="w-4 h-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={() => onEdit(file)}>
            <Edit className="w-4 h-4 mr-2" />
            {t('documents.edit')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleDownload} disabled={isDownloading}>
            {isDownloading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            {t('documents.download')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              if (
                confirm(t('documents.archive_confirm', { title: file.title }))
              )
                onArchive(file);
            }}
          >
            <Archive className="w-4 h-4 mr-2" />
            {t('documents.archive')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              if (confirm(t('documents.delete_confirm', { title: file.title })))
                onDelete(file);
            }}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {t('documents.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
