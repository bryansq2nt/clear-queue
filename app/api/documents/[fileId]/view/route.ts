import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUser } from '@/lib/auth';

const BUCKET = 'project-docs';

export async function GET(
  _req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const user = await getUser();
  if (!user) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const supabase = await createClient();
  const { fileId } = params;

  const { data: rawRow, error } = await supabase
    .from('project_files')
    .select('id, owner_id, path')
    .eq('id', fileId)
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .single();

  const row = rawRow as { id: string; owner_id: string; path: string } | null;

  if (error || !row) {
    return new NextResponse('Not found', { status: 404 });
  }

  const { data: signed, error: signedError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(row.path, 3600);

  if (signedError || !signed?.signedUrl) {
    return new NextResponse('Could not generate URL', { status: 500 });
  }

  // fire-and-forget touch
  supabase
    .from('project_files')
    .update({ last_opened_at: new Date().toISOString() } as never)
    .eq('id', fileId)
    .then(() => {});

  return NextResponse.redirect(signed.signedUrl, 302);
}
