'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Plus } from 'lucide-react';
import { Database } from '@/lib/supabase/types';
import { useI18n } from '@/components/shared/I18nProvider';
import { useContextDataCache } from '@/app/context/ContextDataCache';
import { toastError, toastSuccess } from '@/lib/ui/toast';
import {
  getMedia,
  getMediaSignedUrl,
  touchMedia,
  archiveMedia,
  unarchiveMedia,
  deleteMedia,
  markMediaFinal,
  createMediaShareLink,
} from '@/app/actions/media';
import {
  MEDIA_PAGE_SIZE,
  MEDIA_CATEGORY_VALUES,
  isImageMimeType,
} from '@/lib/validation/project-media';
import { getMediaImageUrl, setMediaImageUrl } from '@/lib/media-image-cache';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { MediaCard } from '@/components/context/media/MediaCard';
import { MediaCanvas } from '@/components/context/media/MediaCanvas';
import { UploadMediaDialog } from '@/components/context/media/UploadMediaDialog';
import { EditMediaDialog } from '@/components/context/media/EditMediaDialog';

type ProjectFile = Database['public']['Tables']['project_files']['Row'];

type PaginatedMediaCache = {
  items: ProjectFile[];
  hasMore: boolean;
  loadedCount: number;
};

interface ContextMediaClientProps {
  projectId: string;
  initialMedia: ProjectFile[];
  initialHasMore: boolean;
  initialLoadedCount: number;
}

export default function ContextMediaClient({
  projectId,
  initialMedia,
  initialHasMore,
  initialLoadedCount,
}: ContextMediaClientProps) {
  const { t } = useI18n();
  const cache = useContextDataCache();

  const [media, setMedia] = useState<ProjectFile[]>(initialMedia);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadedCount, setLoadedCount] = useState(initialLoadedCount);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [canvasFile, setCanvasFile] = useState<ProjectFile | null>(null);
  const [canvasUrl, setCanvasUrl] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<ProjectFile | null>(null);
  const [downloadConfirmFile, setDownloadConfirmFile] =
    useState<ProjectFile | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [archiveConfirmFile, setArchiveConfirmFile] =
    useState<ProjectFile | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [isFiltersDefault, setIsFiltersDefault] = useState(true);
  const [category, setCategory] = useState<string>('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showArchived, setShowArchived] = useState(false);
  const [isRefetching, setIsRefetching] = useState(false);
  const filtersChangedOnce = useRef(false);

  const fetchWithFilters = useCallback(
    async (offset: number) => {
      const result = await getMedia(projectId, {
        offset,
        limit: MEDIA_PAGE_SIZE,
        category: category || undefined,
        favoritesOnly,
        sortOrder,
        includeArchived: showArchived,
      });
      return result;
    },
    [projectId, category, favoritesOnly, sortOrder, showArchived]
  );

  const refreshFromServer = useCallback(async () => {
    const result = await fetchWithFilters(0);
    const newCache: PaginatedMediaCache = {
      items: result.items,
      hasMore: result.hasMore,
      loadedCount: result.items.length,
    };
    if (isFiltersDefault) {
      cache.set({ type: 'media', projectId }, newCache);
    }
    setMedia(result.items);
    setHasMore(result.hasMore);
    setLoadedCount(result.items.length);
  }, [projectId, cache, fetchWithFilters, isFiltersDefault]);

  useEffect(() => {
    if (!filtersChangedOnce.current) return;
    setIsRefetching(true);
    setIsFiltersDefault(false);
    fetchWithFilters(0).then((result) => {
      setMedia(result.items);
      setHasMore(result.hasMore);
      setLoadedCount(result.items.length);
      setIsRefetching(false);
    });
  }, [category, favoritesOnly, sortOrder, showArchived, fetchWithFilters]);

  // --- Canvas handlers ---

  const handleCardClick = async (file: ProjectFile) => {
    setCanvasFile(file);
    const isImage = isImageMimeType(file.mime_type);
    const cached = isImage ? getMediaImageUrl(file.id) : null;
    setCanvasUrl(cached ?? null);
    void touchMedia(file.id);
    const { url: signedUrl, error } = await getMediaSignedUrl(file.id);
    if (error || !signedUrl) return;
    if (!isImage) {
      setCanvasUrl(signedUrl);
      return;
    }
    try {
      const res = await fetch(signedUrl, { credentials: 'omit' });
      if (!res.ok) {
        setCanvasUrl(signedUrl);
        return;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      setMediaImageUrl(file.id, objectUrl);
      setCanvasUrl(objectUrl);
    } catch {
      setCanvasUrl(signedUrl);
    }
  };

  const handleCanvasClose = () => {
    setCanvasFile(null);
    setCanvasUrl(null);
  };

  const handleCanvasMarkFinal = async (isFinal: boolean) => {
    if (!canvasFile) return;
    const prevCanvasFile = canvasFile;
    // Optimistic update
    setCanvasFile((prev) => (prev ? { ...prev, is_final: isFinal } : null));
    setMedia((prev) =>
      prev.map((f) =>
        f.id === prevCanvasFile.id ? { ...f, is_final: isFinal } : f
      )
    );
    const { success } = await markMediaFinal(prevCanvasFile.id, isFinal);
    if (!success) {
      // Revert
      setCanvasFile((prev) => (prev ? { ...prev, is_final: !isFinal } : null));
      setMedia((prev) =>
        prev.map((f) =>
          f.id === prevCanvasFile.id ? { ...f, is_final: !isFinal } : f
        )
      );
      toastError(t('media.mark_final_error'));
    }
  };

  const handleCardToggleFavorite = async (
    file: ProjectFile,
    isFinal: boolean
  ) => {
    const prev = file;
    setMedia((prevList) =>
      prevList.map((f) => (f.id === file.id ? { ...f, is_final: isFinal } : f))
    );
    if (canvasFile?.id === file.id) {
      setCanvasFile((c) => (c ? { ...c, is_final: isFinal } : null));
    }
    const { success } = await markMediaFinal(file.id, isFinal);
    if (!success) {
      setMedia((prevList) =>
        prevList.map((f) =>
          f.id === file.id ? { ...f, is_final: prev.is_final } : f
        )
      );
      if (canvasFile?.id === file.id) {
        setCanvasFile((c) => (c ? { ...c, is_final: prev.is_final } : null));
      }
      toastError(t('media.mark_final_error'));
    }
  };

  const handleCanvasArchive = async () => {
    if (!canvasFile) return;
    const archivedFile = canvasFile;
    setArchiveConfirmFile(null);
    handleCanvasClose();
    setMedia((prev) => prev.filter((f) => f.id !== archivedFile.id));
    const { success } = await archiveMedia(archivedFile.id);
    if (!success) {
      void refreshFromServer();
      toastError(t('media.archive_error'));
    }
  };

  const handleArchiveConfirm = async () => {
    const file = archiveConfirmFile;
    if (!file) return;
    setArchiveConfirmFile(null);
    if (canvasFile?.id === file.id) handleCanvasClose();
    setMedia((prev) => prev.filter((f) => f.id !== file.id));
    const { success } = await archiveMedia(file.id);
    if (!success) {
      void refreshFromServer();
      toastError(t('media.archive_error'));
    }
  };

  const handleCanvasUnarchive = async () => {
    if (!canvasFile) return;
    const file = canvasFile;
    const updated = { ...file, archived_at: null };
    setCanvasFile(updated);
    setMedia((prev) => prev.map((f) => (f.id === file.id ? updated : f)));
    const { success } = await unarchiveMedia(file.id);
    if (!success) {
      setCanvasFile(file);
      setMedia((prev) => prev.map((f) => (f.id === file.id ? file : f)));
      toastError(t('media.archive_error'));
    }
  };

  const handleCanvasDelete = async () => {
    if (!canvasFile) return;
    const deletedFile = canvasFile;
    handleCanvasClose();
    // Optimistic remove
    setMedia((prev) => prev.filter((f) => f.id !== deletedFile.id));
    const { success } = await deleteMedia(deletedFile.id);
    if (!success) {
      void refreshFromServer();
      toastError(t('media.delete_error'));
    }
  };

  const handleEditSuccess = (updated: ProjectFile) => {
    setEditTarget(null);
    setCanvasFile(updated);
    setMedia((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
  };

  // --- Pagination ---

  const handleLoadMore = async () => {
    setIsLoadingMore(true);
    const result = await fetchWithFilters(loadedCount);
    const updatedItems = [...media, ...result.items];
    const newLoadedCount = loadedCount + result.items.length;
    setMedia(updatedItems);
    setHasMore(result.hasMore);
    setLoadedCount(newLoadedCount);
    if (isFiltersDefault) {
      cache.set(
        { type: 'media', projectId },
        {
          items: updatedItems,
          hasMore: result.hasMore,
          loadedCount: newLoadedCount,
        }
      );
    }
    setIsLoadingMore(false);
  };

  // --- Upload ---

  const handleUploadSuccess = (file: ProjectFile) => {
    setUploadOpen(false);
    setMedia((prev) => [file, ...prev]);
  };

  return (
    <div className="relative min-h-full p-4 md:p-6">
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">
            {t('media.filter_category')}
          </Label>
          <Select
            value={category || 'all'}
            onValueChange={(v) => {
              setCategory(v === 'all' ? '' : v);
              filtersChangedOnce.current = true;
            }}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder={t('media.filter_all_categories')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {t('media.filter_all_categories')}
              </SelectItem>
              {MEDIA_CATEGORY_VALUES.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {t(`media.category_${cat}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">
            {t('media.filter_sort')}
          </Label>
          <Select
            value={sortOrder}
            onValueChange={(v: 'asc' | 'desc') => {
              setSortOrder(v);
              filtersChangedOnce.current = true;
            }}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">{t('media.sort_date_desc')}</SelectItem>
              <SelectItem value="asc">{t('media.sort_date_asc')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent/50">
          <input
            type="checkbox"
            checked={favoritesOnly}
            onChange={(e) => {
              setFavoritesOnly(e.target.checked);
              filtersChangedOnce.current = true;
            }}
            className="h-4 w-4 rounded border-input"
          />
          <span>{t('media.filter_favorites')}</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent/50">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => {
              setShowArchived(e.target.checked);
              filtersChangedOnce.current = true;
            }}
            className="h-4 w-4 rounded border-input"
          />
          <span>{t('media.show_archived')}</span>
        </label>
      </div>

      {/* Empty state */}
      {media.length === 0 && !isRefetching && (
        <div className="flex flex-col items-center justify-center py-24">
          <ImageIcon className="mb-4 h-12 w-12 text-muted-foreground" />
          <p className="mb-4 text-muted-foreground">
            {t('media.no_media_yet')}
          </p>
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="text-sm font-medium text-primary hover:underline"
          >
            {t('media.upload')}
          </button>
        </div>
      )}

      {/* Grid */}
      {media.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {media.map((file) => (
            <MediaCard
              key={file.id}
              file={file}
              onClick={() => void handleCardClick(file)}
              onToggleFavorite={(isFinal) =>
                void handleCardToggleFavorite(file, isFinal)
              }
            />
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => void handleLoadMore()}
            disabled={isLoadingMore}
            className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoadingMore ? t('common.loading') : t('media.load_more')}
          </button>
        </div>
      )}

      {/* FAB */}
      <button
        type="button"
        onClick={() => setUploadOpen(true)}
        aria-label={t('media.upload')}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* Canvas */}
      {canvasFile && (
        <MediaCanvas
          file={canvasFile}
          url={canvasUrl}
          open
          onClose={handleCanvasClose}
          onMarkFinal={(isFinal) => void handleCanvasMarkFinal(isFinal)}
          onEdit={() => setEditTarget(canvasFile)}
          onArchive={() => setArchiveConfirmFile(canvasFile)}
          onUnarchive={handleCanvasUnarchive}
          onDelete={() => void handleCanvasDelete()}
          onDownload={() => setDownloadConfirmFile(canvasFile)}
          onShare={async () => {
            const result = await createMediaShareLink(canvasFile.id);
            if (result.error) {
              toastError(t('media.share_error'));
              return;
            }
            const fullUrl =
              typeof window !== 'undefined' && result.url
                ? `${window.location.origin}${result.url}`
                : (result.url ?? '');
            setShareLink(fullUrl);
          }}
        />
      )}

      {/* Dialogs */}
      <UploadMediaDialog
        open={uploadOpen}
        projectId={projectId}
        onClose={() => setUploadOpen(false)}
        onSuccess={handleUploadSuccess}
      />
      <EditMediaDialog
        open={editTarget !== null}
        file={editTarget}
        onClose={() => setEditTarget(null)}
        onSuccess={handleEditSuccess}
      />

      {/* Download confirm — no new tab; fetch and trigger download */}
      <Dialog
        open={downloadConfirmFile !== null}
        onOpenChange={(open) => !open && setDownloadConfirmFile(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('media.download_confirm_title')}</DialogTitle>
            <DialogDescription>
              {t('media.download_confirm_message')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDownloadConfirmFile(null)}
              disabled={isDownloading}
            >
              {t('common.cancel')}
            </Button>
            <Button
              disabled={isDownloading}
              onClick={async () => {
                if (!downloadConfirmFile) return;
                setIsDownloading(true);
                try {
                  const res = await fetch(
                    `/api/media/${downloadConfirmFile.id}/download`,
                    { credentials: 'include' }
                  );
                  if (!res.ok) throw new Error('Download failed');
                  const blob = await res.blob();
                  const baseName = (
                    downloadConfirmFile.title?.trim() || 'media'
                  ).replace(/[^a-zA-Z0-9._-]/g, '_');
                  const ext = downloadConfirmFile.file_ext?.trim() || 'bin';
                  const filename = `${baseName}.${ext}`;
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = filename;
                  a.click();
                  URL.revokeObjectURL(url);
                } catch {
                  toastError(t('media.download_error'));
                } finally {
                  setIsDownloading(false);
                  setDownloadConfirmFile(null);
                }
              }}
            >
              {isDownloading
                ? t('common.loading')
                : t('media.download_confirm_btn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive confirm */}
      <Dialog
        open={archiveConfirmFile !== null}
        onOpenChange={(open) => !open && setArchiveConfirmFile(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('media.archive_confirm_title')}</DialogTitle>
            <DialogDescription>
              {t('media.archive_confirm_message')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setArchiveConfirmFile(null)}
            >
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void handleArchiveConfirm()}>
              {t('media.archive_confirm_btn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share link dialog */}
      <Dialog
        open={shareLink !== null}
        onOpenChange={(open) => !open && setShareLink(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('media.share_dialog_title')}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Input
              readOnly
              value={shareLink ?? ''}
              className="font-mono text-sm"
            />
            <Button
              onClick={async () => {
                if (!shareLink) return;
                try {
                  await navigator.clipboard.writeText(shareLink);
                  toastSuccess(t('media.share_link_copied'));
                } catch {
                  toastError(t('media.share_error'));
                }
              }}
            >
              {t('media.share_dialog_copy')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
