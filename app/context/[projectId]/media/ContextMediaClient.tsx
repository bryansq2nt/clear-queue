'use client';

import { useCallback, useState } from 'react';
import { Image as ImageIcon, Plus } from 'lucide-react';
import { Database } from '@/lib/supabase/types';
import { useI18n } from '@/components/shared/I18nProvider';
import { useContextDataCache } from '@/app/context/ContextDataCache';
import { toastError } from '@/lib/ui/toast';
import {
  getMedia,
  getMediaSignedUrl,
  touchMedia,
  archiveMedia,
  deleteMedia,
  markMediaFinal,
} from '@/app/actions/media';
import { MEDIA_PAGE_SIZE } from '@/lib/validation/project-media';
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

  // Refresh to page 1 — used for error recovery
  const refreshFromServer = useCallback(async () => {
    const result = await getMedia(projectId, {
      offset: 0,
      limit: MEDIA_PAGE_SIZE,
    });
    const newCache: PaginatedMediaCache = {
      items: result.items,
      hasMore: result.hasMore,
      loadedCount: result.items.length,
    };
    cache.set({ type: 'media', projectId }, newCache);
    setMedia(result.items);
    setHasMore(result.hasMore);
    setLoadedCount(result.items.length);
  }, [projectId, cache]);

  // --- Canvas handlers ---

  const handleCardClick = async (file: ProjectFile) => {
    setCanvasFile(file);
    setCanvasUrl(null);
    void touchMedia(file.id);
    const { url, error } = await getMediaSignedUrl(file.id);
    if (error || !url) return;
    setCanvasUrl(url);
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

  const handleCanvasArchive = async () => {
    if (!canvasFile) return;
    const archivedFile = canvasFile;
    handleCanvasClose();
    // Optimistic remove
    setMedia((prev) => prev.filter((f) => f.id !== archivedFile.id));
    const { success } = await archiveMedia(archivedFile.id);
    if (!success) {
      void refreshFromServer();
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
    const result = await getMedia(projectId, {
      offset: loadedCount,
      limit: MEDIA_PAGE_SIZE,
    });
    const updatedItems = [...media, ...result.items];
    const newLoadedCount = loadedCount + result.items.length;
    setMedia(updatedItems);
    setHasMore(result.hasMore);
    setLoadedCount(newLoadedCount);
    cache.set(
      { type: 'media', projectId },
      {
        items: updatedItems,
        hasMore: result.hasMore,
        loadedCount: newLoadedCount,
      }
    );
    setIsLoadingMore(false);
  };

  // --- Upload ---

  const handleUploadSuccess = (file: ProjectFile) => {
    setUploadOpen(false);
    setMedia((prev) => [file, ...prev]);
  };

  return (
    <div className="relative min-h-full p-4 md:p-6">
      {/* Empty state */}
      {media.length === 0 && (
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
          onArchive={() => void handleCanvasArchive()}
          onDelete={() => void handleCanvasDelete()}
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
    </div>
  );
}
