import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUser } from '@/lib/auth';

const BUCKET = 'project-media';

export async function GET(
  _req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const user = await getUser();
  if (!user) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const supabase = await createClient();
  const fileId = params?.fileId?.trim();
  if (!fileId) {
    return new NextResponse('Bad request', { status: 400 });
  }

  const { data: rawRow, error } = await supabase
    .from('project_files')
    .select('id, owner_id, path, title, file_ext, mime_type')
    .eq('id', fileId)
    .eq('owner_id', user.id)
    .eq('kind', 'media')
    .is('deleted_at', null)
    .single();

  const row = rawRow as {
    id: string;
    owner_id: string;
    path: string;
    title: string;
    file_ext: string | null;
    mime_type: string;
  } | null;

  if (error || !row) {
    return new NextResponse('Not found', { status: 404 });
  }

  const baseName =
    (row.title?.trim() || 'media').replace(/[^a-zA-Z0-9._-]/g, '_') || 'media';
  const ext = row.file_ext?.trim() || 'bin';
  const filename = `${baseName}.${ext}`;

  const { data: signed, error: signedError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(row.path, 3600, { download: filename });

  if (signedError || !signed?.signedUrl) {
    return new NextResponse('Could not generate download URL', { status: 500 });
  }

  // Proxy the file so the client can fetch() and trigger download without opening a new tab
  const fileRes = await fetch(signed.signedUrl);
  if (!fileRes.ok) {
    return new NextResponse('Could not fetch file', { status: 502 });
  }
  const body = await fileRes.arrayBuffer();
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': row.mime_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '\\"')}"`,
    },
  });
}
