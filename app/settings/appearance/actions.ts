'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth, getUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { Database } from '@/lib/supabase/types';
import { validateThemeMode, validateHexColor } from '@/lib/validation/colors';
import { validateCurrency } from '@/lib/validation/profile';

type UserPreferences = Database['public']['Tables']['user_preferences']['Row'];

export async function getPreferences(): Promise<UserPreferences | null> {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return null;
  if (data) return data as UserPreferences;

  const insertPayload: Database['public']['Tables']['user_preferences']['Insert'] =
    {
      user_id: user.id,
    };
  const { data: inserted } = await supabase
    .from('user_preferences')
    .insert(insertPayload as never)
    .select()
    .single();

  return inserted ? (inserted as UserPreferences) : null;
}

export async function getPreferencesOptional(): Promise<UserPreferences | null> {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  return data ? (data as UserPreferences) : null;
}

export async function updatePreferences(payload: {
  theme_mode?: 'light' | 'dark' | 'system';
  primary_color?: string;
  secondary_color?: string;
  third_color?: string;
  currency?: string;
  company_logo_asset_id?: string | null;
  cover_image_asset_id?: string | null;
}): Promise<{ error?: string; data?: UserPreferences }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const updates: Database['public']['Tables']['user_preferences']['Update'] =
    {};

  if (payload.theme_mode !== undefined) {
    const t = validateThemeMode(payload.theme_mode);
    if (!t.ok) return { error: t.error };
    updates.theme_mode = t.value;
  }
  if (payload.primary_color !== undefined) {
    const c = validateHexColor(payload.primary_color);
    if (!c.ok) return { error: c.error };
    updates.primary_color = c.value;
  }
  if (payload.secondary_color !== undefined) {
    const c = validateHexColor(payload.secondary_color);
    if (!c.ok) return { error: c.error };
    updates.secondary_color = c.value;
  }
  if (payload.third_color !== undefined) {
    const c = validateHexColor(payload.third_color);
    if (!c.ok) return { error: c.error };
    updates.third_color = c.value;
  }
  if (payload.currency !== undefined) {
    const cur = validateCurrency(payload.currency);
    if (!cur.ok) return { error: cur.error };
    updates.currency = cur.value;
  }
  if (payload.company_logo_asset_id !== undefined) {
    if (payload.company_logo_asset_id) {
      const { data } = await supabase
        .from('user_assets')
        .select('id, user_id, kind')
        .eq('id', payload.company_logo_asset_id)
        .single();
      const asset = data as {
        id: string;
        user_id: string;
        kind: string;
      } | null;
      if (
        !asset ||
        asset.user_id !== user.id ||
        asset.kind !== 'company_logo'
      ) {
        return { error: 'Invalid company logo asset' };
      }
    }
    updates.company_logo_asset_id = payload.company_logo_asset_id;
  }
  if (payload.cover_image_asset_id !== undefined) {
    if (payload.cover_image_asset_id) {
      const { data } = await supabase
        .from('user_assets')
        .select('id, user_id, kind')
        .eq('id', payload.cover_image_asset_id)
        .single();
      const asset = data as {
        id: string;
        user_id: string;
        kind: string;
      } | null;
      if (!asset || asset.user_id !== user.id || asset.kind !== 'cover_image') {
        return { error: 'Invalid cover image asset' };
      }
    }
    updates.cover_image_asset_id = payload.cover_image_asset_id;
  }

  if (Object.keys(updates).length === 0) {
    const existing = await getPreferences();
    return { data: existing ?? undefined };
  }

  const upsertPayload: Database['public']['Tables']['user_preferences']['Insert'] =
    {
      user_id: user.id,
      ...updates,
    };
  const { data, error } = await supabase
    .from('user_preferences')
    .upsert(upsertPayload as never, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) return { error: error.message };
  revalidatePath('/settings/appearance');
  revalidatePath('/settings/profile');
  revalidatePath('/');
  return { data: data as UserPreferences };
}
