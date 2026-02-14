/**
 * User asset upload utilities
 * - Only image mime types (png/jpg/jpeg/webp)
 * - File size limit (5MB)
 * - Server-side validation, never trust client path
 * - Path convention: {user_id}/{kind}/{uuid}.{ext}
 */

import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { Database } from '@/lib/supabase/types'

const BUCKET = 'user-assets'
const MAX_SIZE_BYTES = 5 * 1024 * 1024 // 5MB

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
])

const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
}

type AssetKind = 'avatar' | 'company_logo' | 'cover_image'

export async function uploadUserAsset(
  file: File,
  kind: AssetKind
): Promise<{ error?: string; data?: Database['public']['Tables']['user_assets']['Row'] }> {
  const user = await requireAuth()
  const supabase = await createClient()

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { error: 'Only PNG, JPEG, and WebP images are allowed' }
  }
  if (file.size > MAX_SIZE_BYTES) {
    return { error: 'File size must be 5MB or less' }
  }
  if (file.size <= 0) {
    return { error: 'Invalid file' }
  }

  const ext = MIME_TO_EXT[file.type] ?? 'png'
  const uuid = crypto.randomUUID()
  const path = `${user.id}/${kind}/${uuid}.${ext}`

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    return { error: uploadError.message }
  }
  if (!uploadData?.path) {
    return { error: 'Upload failed' }
  }

  const insertPayload: Database['public']['Tables']['user_assets']['Insert'] = {
    user_id: user.id,
    kind,
    bucket: BUCKET,
    path: uploadData.path,
    mime_type: file.type,
    size_bytes: file.size,
    width: null,
    height: null,
  }

  const { data: row, error: insertError } = await supabase
    .from('user_assets')
    .insert(insertPayload as never)
    .select()
    .single()

  if (insertError) {
    await supabase.storage.from(BUCKET).remove([uploadData.path])
    return { error: insertError.message }
  }

  return { data: row as Database['public']['Tables']['user_assets']['Row'] }
}
