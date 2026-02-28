'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Archive,
  Download,
  Heart,
  MoreVertical,
  Pencil,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useI18n } from '@/components/shared/I18nProvider';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import {
  isImageMimeType,
  isVideoMimeType,
} from '@/lib/validation/project-media';
import { cn } from '@/lib/utils';
import { Database } from '@/lib/supabase/types';

type ProjectFile = Database['public']['Tables']['project_files']['Row'];

interface MediaCanvasProps {
  file: ProjectFile;
  url: string | null;
  open: boolean;
  onClose: () => void;
  onMarkFinal: (isFinal: boolean) => void;
  onEdit: () => void;
  onArchive: () => void;
  onUnarchive?: () => void;
  onDelete: () => void;
  onShare?: () => void;
  onDownload?: () => void;
}

export function MediaCanvas({
  file,
  url,
  open,
  onClose,
  onMarkFinal,
  onEdit,
  onArchive,
  onUnarchive,
  onDelete,
  onShare,
  onDownload,
}: MediaCanvasProps) {
  const isArchived = Boolean(file.archived_at);
  const { t } = useI18n();
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Canvas entry animation — 10ms tick gives browser time to paint opacity-0 first
  const [mounted, setMounted] = useState(false);
  // Image fade-in once it loads from the signed URL
  const [imgLoaded, setImgLoaded] = useState(false);

  // Actions menu: closed on open; user opens via 3-dots
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  // Bottom widget: expand full description
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  // Overlay UI (close, 3-dots, bottom bar): tap content to hide/show so user can focus on image
  const [overlayVisible, setOverlayVisible] = useState(true);

  // Trigger canvas fade-in on mount
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 10);
    return () => clearTimeout(timer);
  }, []);

  // Reset imgLoaded and description expanded when file/url changes (new file opened)
  useEffect(() => {
    setImgLoaded(false);
    setDescriptionExpanded(false);
  }, [url, file.id]);

  // When canvas opens, show overlay UI and keep menu closed
  useEffect(() => {
    if (open) {
      setOverlayVisible(true);
      setMenuOpen(false);
    }
  }, [open]);

  // Reset delete confirm when canvas closes
  useEffect(() => {
    if (!open) {
      setDeleteConfirm(false);
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    }
  }, [open]);

  // ESC key to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Tap content area → hide overlay UI (or show it again) so user can view image without interruptions
  const handleContentClick = () => {
    setMenuOpen(false);
    setOverlayVisible((prev) => !prev);
  };

  const handleDeleteFromMenu = () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      deleteTimerRef.current = setTimeout(() => setDeleteConfirm(false), 3000);
    } else {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
      onDelete();
    }
  };

  if (!open) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 bg-black transition-opacity duration-200 ease-out',
        mounted ? 'opacity-100' : 'opacity-0'
      )}
    >
      {/* Content area — Facebook-style margins so image doesn’t fill edge-to-edge */}
      <div
        className="absolute inset-0 cursor-pointer flex items-center justify-center p-4 sm:p-6 md:p-8 lg:p-10"
        onClick={handleContentClick}
      >
        {/* Skeleton while signed URL is fetching */}
        {url === null && (
          <div className="flex h-full w-full max-h-full max-w-full items-center justify-center">
            <Skeleton className="h-64 w-64 rounded-xl" />
          </div>
        )}

        {/* Image — 25% smaller (max 75% of space) so it never covers close/menu buttons */}
        {url !== null && isImageMimeType(file.mime_type) && (
          <div className="h-full w-full min-h-0 min-w-0 max-h-[75%] max-w-[75%]">
            <TransformWrapper
              initialScale={1}
              minScale={0.5}
              maxScale={4}
              limitToBounds
              centerOnInit
              doubleClick={{ mode: 'reset' }}
            >
              <TransformComponent
                wrapperStyle={{ width: '100%', height: '100%' }}
                contentStyle={{ width: '100%', height: '100%' }}
              >
                <img
                  src={url}
                  alt={file.title}
                  onLoad={() => setImgLoaded(true)}
                  className={cn(
                    'h-full w-full object-contain transition-opacity duration-200',
                    imgLoaded ? 'opacity-100' : 'opacity-0'
                  )}
                  draggable={false}
                />
              </TransformComponent>
            </TransformWrapper>
          </div>
        )}

        {/* Video — same max 75% size as image */}
        {url !== null && isVideoMimeType(file.mime_type) && (
          <div className="h-full w-full min-h-0 min-w-0 max-h-[75%] max-w-[75%] flex items-center justify-center">
            <video
              src={url}
              controls
              className="max-h-full max-w-full w-auto h-auto object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </div>

      {/* Close — top-left; hidden when overlay is dismissed */}
      <button
        type="button"
        onClick={onClose}
        className={cn(
          'fixed left-4 top-4 z-20 flex min-h-[48px] min-w-[48px] items-center justify-center rounded-md text-white/70 transition-opacity duration-200 hover:text-white',
          !overlayVisible && 'pointer-events-none opacity-0'
        )}
        aria-label="Close"
        title="Close"
      >
        <X className="h-6 w-6" />
      </button>

      {/* 3-dots actions menu — top-right; menu closed on open; tap content to hide/show overlay */}
      <div
        className={cn(
          'fixed right-4 top-4 z-20 transition-opacity duration-200',
          !overlayVisible && 'pointer-events-none opacity-0'
        )}
      >
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="fixed right-4 top-4 z-20 flex min-h-[48px] min-w-[48px] items-center justify-center rounded-md text-white/70 transition-colors hover:text-white"
              aria-label="Actions"
              title="Actions"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-6 w-6" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            side="bottom"
            sideOffset={8}
            className="z-30 min-w-[10rem]"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenuItem
              onClick={() => {
                onShare?.();
                setMenuOpen(false);
              }}
              disabled={!onShare}
            >
              <Share2 className="mr-2 h-4 w-4" />
              Share
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                onDownload?.();
                setMenuOpen(false);
              }}
              disabled={!onDownload}
            >
              <Download className="mr-2 h-4 w-4" />
              Download
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                onEdit();
                setMenuOpen(false);
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                if (isArchived) {
                  onUnarchive?.();
                } else {
                  onArchive();
                }
                setMenuOpen(false);
              }}
            >
              <Archive className="mr-2 h-4 w-4" />
              {isArchived ? t('media.unarchive') : t('media.archive')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleDeleteFromMenu}
              className={cn(
                deleteConfirm && 'text-destructive focus:text-destructive'
              )}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {deleteConfirm ? 'Confirm delete?' : 'Delete'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Bottom widget: title, tags, collapsed description, expandable full description, Favorite; hidden when overlay dismissed */}
      <div
        className={cn(
          'fixed bottom-0 left-0 right-0 z-10 max-h-[40vh] overflow-y-auto bg-black/70 px-4 py-3 backdrop-blur-sm transition-opacity duration-200',
          !overlayVisible && 'pointer-events-none opacity-0'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">
              {file.title}
            </p>
            {file.media_category && (
              <p className="text-xs capitalize text-white/60">
                {file.media_category}
              </p>
            )}
            {Array.isArray(file.tags) && file.tags.length > 0 && (
              <p className="mt-1 text-xs text-white/70">
                {file.tags.join(', ')}
              </p>
            )}
            {file.description && (
              <div className="mt-1">
                <p
                  className={cn(
                    'text-xs text-white/70',
                    !descriptionExpanded && 'line-clamp-2'
                  )}
                >
                  {file.description}
                </p>
                <button
                  type="button"
                  onClick={() => setDescriptionExpanded((prev) => !prev)}
                  className="mt-0.5 text-xs font-medium text-white/80 underline hover:text-white"
                >
                  {descriptionExpanded
                    ? t('media.show_less')
                    : t('media.show_more')}
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => onMarkFinal(!file.is_final)}
            className={cn(
              'flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-md px-2 transition-colors',
              file.is_final
                ? 'text-red-400 hover:text-red-300'
                : 'text-white/70 hover:text-white'
            )}
            aria-label={
              file.is_final ? 'Remove from favorites' : 'Add to favorites'
            }
            title={file.is_final ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Heart
              className="h-5 w-5"
              fill={file.is_final ? 'currentColor' : 'none'}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
