'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, Pencil, Star, Trash2, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  isImageMimeType,
  isVideoMimeType,
  MEDIA_CANVAS_ACTIONBAR_HIDE_DELAY_MS,
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
  onDelete: () => void;
}

export function MediaCanvas({
  file,
  url,
  open,
  onClose,
  onMarkFinal,
  onEdit,
  onArchive,
  onDelete,
}: MediaCanvasProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Canvas entry animation — 10ms tick gives browser time to paint opacity-0 first
  const [mounted, setMounted] = useState(false);
  // Image fade-in once it loads from the signed URL
  const [imgLoaded, setImgLoaded] = useState(false);

  const [barVisible, setBarVisible] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Trigger canvas fade-in on mount
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 10);
    return () => clearTimeout(timer);
  }, []);

  // Reset imgLoaded whenever the url changes (new file opened)
  useEffect(() => {
    setImgLoaded(false);
  }, [url]);

  const showBar = useCallback(() => {
    setBarVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(
      () => setBarVisible(false),
      MEDIA_CANVAS_ACTIONBAR_HIDE_DELAY_MS
    );
  }, []);

  // Start auto-hide timer when canvas opens
  useEffect(() => {
    if (open) showBar();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [open, showBar]);

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

  const handleContentClick = () => {
    if (barVisible) {
      setBarVisible(false);
      if (timerRef.current) clearTimeout(timerRef.current);
    } else {
      showBar();
    }
  };

  const handleDeleteClick = () => {
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
      {/* Content area — clicking toggles action bar */}
      <div
        className="relative h-full w-full cursor-pointer"
        onClick={handleContentClick}
      >
        {/* Skeleton while signed URL is fetching */}
        {url === null && (
          <div className="flex h-full items-center justify-center">
            <Skeleton className="h-64 w-64 rounded-xl" />
          </div>
        )}

        {/* Image — fades in once loaded */}
        {url !== null && isImageMimeType(file.mime_type) && (
          <img
            src={url}
            alt={file.title}
            onLoad={() => setImgLoaded(true)}
            className={cn(
              'h-full w-full object-contain transition-opacity duration-200',
              imgLoaded ? 'opacity-100' : 'opacity-0'
            )}
          />
        )}

        {/* Video */}
        {url !== null && isVideoMimeType(file.mime_type) && (
          <video
            src={url}
            controls
            className="h-full w-full"
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>

      {/* Action bar — auto-hides with slide + fade */}
      <div
        className={cn(
          'fixed bottom-0 left-0 right-0 z-10 flex items-center gap-2 bg-black/70 px-4 py-3 backdrop-blur-sm transition-all duration-150',
          barVisible
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none translate-y-2 opacity-0'
        )}
        onMouseEnter={showBar}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title + category — left */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">
            {file.title}
          </p>
          {file.media_category && (
            <p className="text-xs capitalize text-white/60">
              {file.media_category}
            </p>
          )}
        </div>

        {/* Mark as Final */}
        <button
          type="button"
          onClick={() => onMarkFinal(!file.is_final)}
          className={cn(
            'flex min-h-[48px] min-w-[48px] items-center justify-center rounded-md px-2 transition-colors',
            file.is_final
              ? 'text-yellow-400 hover:text-yellow-300'
              : 'text-white/70 hover:text-white'
          )}
          aria-label={file.is_final ? 'Remove final mark' : 'Mark as final'}
          title={file.is_final ? 'Remove final mark' : 'Mark as final'}
        >
          <Star
            className="h-5 w-5"
            fill={file.is_final ? 'currentColor' : 'none'}
          />
        </button>

        {/* Edit */}
        <button
          type="button"
          onClick={() => {
            onEdit();
            showBar();
          }}
          className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-md px-2 text-white/70 transition-colors hover:text-white"
          aria-label="Edit"
          title="Edit"
        >
          <Pencil className="h-5 w-5" />
        </button>

        {/* Archive */}
        <button
          type="button"
          onClick={onArchive}
          className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-md px-2 text-white/70 transition-colors hover:text-white"
          aria-label="Archive"
          title="Archive"
        >
          <Archive className="h-5 w-5" />
        </button>

        {/* Delete — two-step confirm */}
        <button
          type="button"
          onClick={handleDeleteClick}
          className={cn(
            'flex min-h-[48px] items-center justify-center rounded-md px-3 text-sm font-medium transition-colors',
            deleteConfirm
              ? 'text-red-400 hover:text-red-300'
              : 'text-white/70 hover:text-white'
          )}
          aria-label={deleteConfirm ? 'Confirm delete' : 'Delete'}
        >
          {deleteConfirm ? 'Confirm?' : <Trash2 className="h-5 w-5" />}
        </button>

        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-md px-2 text-white/70 transition-colors hover:text-white"
          aria-label="Close"
          title="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
