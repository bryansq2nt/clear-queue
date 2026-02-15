'use server';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, getUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { Database } from '@/lib/supabase/types';
import {
  validateDisplayName,
  validatePhone,
  validateTimezone,
  validateLocale,
} from '@/lib/validation/profile';
import { uploadUserAsset as doUploadUserAsset } from '@/lib/storage/upload';

type Profile = Database['public']['Tables']['profiles']['Row'];
type UserAsset = Database['public']['Tables']['user_assets']['Row'];

const PROFILE_COLS =
  'user_id, display_name, phone, timezone, locale, avatar_asset_id, created_at, updated_at';

/** Optional profile fetch for layout; returns null when not authenticated. Use getProfile() in pages that require auth. */
export const getProfileOptional = cache(async (): Promise<Profile | null> => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLS)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) return null;
  return data ? (data as Profile) : null;
});

export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLS)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return null;
  if (data) return data as Profile;

  const insertPayload: Database['public']['Tables']['profiles']['Insert'] = {
    user_id: user.id,
    display_name: user.email?.split('@')[0] ?? 'User',
  };
  const { data: inserted, error: insertError } = await supabase
    .from('profiles')
    .insert(insertPayload as never)
    .select(PROFILE_COLS)
    .single();

  if (insertError?.code === '23505') {
    const { data: existing } = await supabase
      .from('profiles')
      .select(PROFILE_COLS)
      .eq('user_id', user.id)
      .single();
    return existing ? (existing as Profile) : null;
  }
  return inserted ? (inserted as Profile) : null;
});

export const getProfileWithAvatar = cache(
  async (): Promise<(Profile & { avatar_asset: UserAsset | null }) | null> => {
    console.log('🔵 [SERVER ACTION] getProfileWithAvatar called');
    console.trace('Call stack:');
    const profile = await getProfile();
    if (!profile) return null;
    if (!profile.avatar_asset_id) return { ...profile, avatar_asset: null };

    const supabase = await createClient();
    const { data: asset } = await supabase
      .from('user_assets')
      .select(
        'id, user_id, kind, bucket, path, mime_type, size_bytes, width, height, created_at'
      )
      .eq('id', profile.avatar_asset_id)
      .single();

    return { ...profile, avatar_asset: asset ? (asset as UserAsset) : null };
  }
);

export async function updateProfile(payload: {
  display_name?: string;
  phone?: string | null;
  timezone?: string;
  locale?: string;
  avatar_asset_id?: string | null;
}): Promise<{ error?: string; data?: Profile }> {
  console.log('🔵 [SERVER ACTION] updateProfile called');
  console.trace('Call stack:');
  const user = await requireAuth();
  const supabase = await createClient();

  const updates: Database['public']['Tables']['profiles']['Update'] = {};

  if (payload.display_name !== undefined) {
    const d = validateDisplayName(payload.display_name);
    if (!d.ok) return { error: d.error };
    updates.display_name = d.value;
  }
  if (payload.phone !== undefined) {
    const p = validatePhone(payload.phone);
    if (!p.ok) return { error: p.error };
    updates.phone = p.value;
  }
  if (payload.timezone !== undefined) {
    const t = validateTimezone(payload.timezone);
    if (!t.ok) return { error: t.error };
    updates.timezone = t.value;
  }
  if (payload.locale !== undefined) {
    const l = validateLocale(payload.locale);
    if (!l.ok) return { error: l.error };
    updates.locale = l.value;
  }
  if (payload.avatar_asset_id !== undefined) {
    updates.avatar_asset_id = payload.avatar_asset_id;
  }

  if (Object.keys(updates).length === 0) {
    const existing = await getProfile();
    return { data: existing ?? undefined };
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(updates as never)
    .eq('user_id', user.id)
    .select(PROFILE_COLS)
    .single();

  if (error) return { error: error.message };
  revalidatePath('/settings/profile');
  revalidatePath('/');
  return { data: data as Profile };
}

export async function uploadUserAsset(
  formData: FormData
): Promise<{ error?: string; data?: UserAsset }> {
  console.log('🔵 [SERVER ACTION] uploadUserAsset called');
  console.trace('Call stack:');
  const file = formData.get('file') as File | null;
  const kind = formData.get('kind') as
    | 'avatar'
    | 'company_logo'
    | 'cover_image'
    | null;
  if (
    !file ||
    !kind ||
    !['avatar', 'company_logo', 'cover_image'].includes(kind)
  ) {
    return {
      error:
        'Invalid upload: file and kind (avatar|company_logo|cover_image) required',
    };
  }
  return doUploadUserAsset(file, kind);
}

export const getAssetSignedUrl = cache(
  async (assetId: string): Promise<string | null> => {
    console.log('🔵 [SERVER ACTION] getAssetSignedUrl called', { assetId });
    console.trace('Call stack:');
    const user = await requireAuth();
    const supabase = await createClient();

    const { data, error: fetchError } = await supabase
      .from('user_assets')
      .select('id, user_id, path, bucket')
      .eq('id', assetId)
      .single();

    const asset = data as {
      id: string;
      user_id: string;
      path: string;
      bucket: string;
    } | null;
    if (fetchError || !asset || asset.user_id !== user.id) return null;

    const { data: urlData } = await supabase.storage
      .from(asset.bucket)
      .createSignedUrl(asset.path, 3600);

    return urlData?.signedUrl ?? null;
  }
);

export async function deleteUserAsset(
  assetId: string
): Promise<{ error?: string }> {
  console.log('🔵 [SERVER ACTION] deleteUserAsset called', { assetId });
  console.trace('Call stack:');
  const user = await requireAuth();
  const supabase = await createClient();

  const { data, error: fetchError } = await supabase
    .from('user_assets')
    .select('id, user_id, kind, path, bucket')
    .eq('id', assetId)
    .single();

  const asset = data as {
    id: string;
    user_id: string;
    kind: string;
    path: string;
    bucket: string;
  } | null;
  if (fetchError || !asset) return { error: 'Asset not found' };
  if (asset.user_id !== user.id) return { error: 'Unauthorized' };

  if (asset.kind === 'avatar') {
    await supabase
      .from('profiles')
      .update({ avatar_asset_id: null } as never)
      .eq('user_id', user.id)
      .eq('avatar_asset_id', assetId);
  } else if (asset.kind === 'company_logo') {
    await supabase
      .from('user_preferences')
      .update({ company_logo_asset_id: null } as never)
      .eq('user_id', user.id)
      .eq('company_logo_asset_id', assetId);
  } else if (asset.kind === 'cover_image') {
    await supabase
      .from('user_preferences')
      .update({ cover_image_asset_id: null } as never)
      .eq('user_id', user.id)
      .eq('cover_image_asset_id', assetId);
  }

  const { error: storageError } = await supabase.storage
    .from(asset.bucket)
    .remove([asset.path]);

  if (storageError) {
    return { error: storageError.message };
  }

  const { error: deleteError } = await supabase
    .from('user_assets')
    .delete()
    .eq('id', assetId)
    .eq('user_id', user.id);

  if (deleteError) return { error: deleteError.message };

  revalidatePath('/settings/profile');
  revalidatePath('/settings/appearance');
  revalidatePath('/');
  return {};
}
