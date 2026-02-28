'use client';

import { useEffect, useState } from 'react';
import { getMediaSignedUrl } from '@/app/actions/media';
import {
  isImageMimeType,
  isVideoMimeType,
} from '@/lib/validation/project-media';
import { SkeletonMediaCard } from '@/components/skeletons/SkeletonMediaCard';
import { Film, ImageOff } from 'lucide-react';
import { Database } from '@/lib/supabase/types';

type ProjectFile = Database['public']['Tables']['project_files']['Row'];

interface MediaCardProps {
  file: ProjectFile;
  onClick: () => void;
}

export function MediaCard({ file, onClick }: MediaCardProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading'
  );

  useEffect(() => {
    if (!isImageMimeType(file.mime_type)) {
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
      setUrl(signedUrl);
      setStatus('ready');
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

      {file.is_final && (
        <span className="absolute right-2 top-2 rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-semibold text-white">
          Final
        </span>
      )}
    </button>
  );
}
