import { notFound } from 'next/navigation';
import { getMediaShareByToken } from '@/app/actions/media';
import {
  isImageMimeType,
  isVideoMimeType,
} from '@/lib/validation/project-media';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { token: string };
}

export default async function ShareMediaPage({ params }: PageProps) {
  const token = params?.token?.trim();
  if (!token) notFound();

  const result = await getMediaShareByToken(token);
  if (result.error || !result.signed_url) notFound();

  const { signed_url, title, description, mime_type } = result;

  return (
    <div className="min-h-screen bg-black">
      <div className="mx-auto max-w-4xl px-4 py-6">
        {/* Media */}
        <div className="flex min-h-[50vh] items-center justify-center">
          {isImageMimeType(mime_type ?? '') && (
            <img
              src={signed_url}
              alt={title ?? 'Shared media'}
              className="max-h-[85vh] w-auto max-w-full object-contain"
            />
          )}
          {isVideoMimeType(mime_type ?? '') && (
            <video
              src={signed_url}
              controls
              className="max-h-[85vh] w-auto max-w-full"
            />
          )}
          {!isImageMimeType(mime_type ?? '') &&
            !isVideoMimeType(mime_type ?? '') && (
              <a
                href={signed_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white underline"
              >
                Open media
              </a>
            )}
        </div>

        {/* Title and description — read-only */}
        <div className="mt-6 text-white">
          <h1 className="text-xl font-semibold">{title}</h1>
          {description && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-white/80">
              {description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
