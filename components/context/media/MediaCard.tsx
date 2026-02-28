'use client';

import { useEffect, useState } from 'react';
import { getMediaSignedUrl } from '@/app/actions/media';
import {
  isImageMimeType,
  isVideoMimeType,
} from '@/lib/validation/project-media';
import { getMediaImageUrl, setMediaImageUrl } from '@/lib/media-image-cache';
import { SkeletonMediaCard } from '@/components/skeletons/SkeletonMediaCard';
import { Film, Heart, ImageOff } from 'lucide-react';
import { Database } from '@/lib/supabase/types';

type ProjectFile = Database['public']['Tables']['project_files']['Row'];

interface MediaCardProps {
  file: ProjectFile;
  onClick: () => void;
  onToggleFavorite?: (isFinal: boolean) => void;
}

export function MediaCard({ file, onClick, onToggleFavorite }: MediaCardProps) {
  const [url, setUrl] = useState<string | null>(() =>
    isImageMimeType(file.mime_type) ? getMediaImageUrl(file.id) : null
  );
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(() => {
    if (!isImageMimeType(file.mime_type)) return 'ready';
    return getMediaImageUrl(file.id) ? 'ready' : 'loading';
  });

  useEffect(() => {
    if (!isImageMimeType(file.mime_type)) {
      setStatus('ready');
      return;
    }
    const cached = getMediaImageUrl(file.id);
    if (cached) {
      setUrl(cached);
      setStatus('ready');
      return;
    }
    let cancelled = false;
    getMediaSignedUrl(file.id).then(({ url: signedUrl, error }) => {
      if (cancelled) return;
      if (error || !signedUrl) {
        setStatus('error');
        return;
      }
      fetch(signedUrl)
        .then((res) =>
          res.ok ? res.blob() : Promise.reject(new Error('Fetch failed'))
        )
        .then((blob) => {
          if (cancelled) return;
          const objectUrl = URL.createObjectURL(blob);
          setMediaImageUrl(file.id, objectUrl);
          setUrl(objectUrl);
          setStatus('ready');
        })
        .catch(() => {
          if (!cancelled) setStatus('error');
        });
    });
    return () => {
      cancelled = true;
    };
  }, [file.id, file.mime_type]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative aspect-square w-full overflow-hidden rounded-lg bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      aria-label={file.title}
    >
      {status === 'loading' && (
        <div className="absolute inset-0">
          <SkeletonMediaCard />
        </div>
      )}

      {status === 'ready' && isImageMimeType(file.mime_type) && url && (
        <img
          src={url}
          alt={file.title}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {status === 'ready' && isVideoMimeType(file.mime_type) && (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted">
          <Film className="h-8 w-8 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Video</span>
        </div>
      )}

      {status === 'error' && (
        <div className="flex h-full w-full items-center justify-center bg-muted">
          <ImageOff className="h-8 w-8 text-muted-foreground" />
        </div>
      )}

      {onToggleFavorite ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(!file.is_final);
          }}
          className={`absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            file.is_final
              ? 'bg-red-500 text-white hover:bg-red-600'
              : 'bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
          aria-label={
            file.is_final ? 'Remove from favorites' : 'Add to favorites'
          }
        >
          <Heart className={`h-4 w-4 ${file.is_final ? 'fill-current' : ''}`} />
        </button>
      ) : file.is_final ? (
        <span
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white"
          aria-label="Favorite"
        >
          <Heart className="h-4 w-4 fill-current" />
        </span>
      ) : null}
    </button>
  );
}
