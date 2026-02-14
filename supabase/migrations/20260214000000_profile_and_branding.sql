-- ============================================
-- PROFILE + BRANDING MODULE
-- User profile, preferences (theme/colors), and asset storage
-- Independent from subscription; no feature gating
-- ============================================

-- ---------------------------------------------------------------------------
-- A) Table: public.user_assets
-- Must exist first (profiles references it via avatar_asset_id)
-- ---------------------------------------------------------------------------
CREATE TABLE public.user_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('avatar', 'company_logo', 'cover_image')),
  bucket TEXT NOT NULL,
  path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
  width INT,
  height INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_user_assets_user_id ON public.user_assets(user_id);
CREATE INDEX idx_user_assets_kind ON public.user_assets(user_id, kind);

ALTER TABLE public.user_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own assets"
  ON public.user_assets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own assets"
  ON public.user_assets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own assets"
  ON public.user_assets FOR DELETE
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- B) Table: public.profiles
-- ---------------------------------------------------------------------------
CREATE TABLE public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  phone TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  locale TEXT NOT NULL DEFAULT 'es',
  avatar_asset_id UUID REFERENCES public.user_assets(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_profiles_avatar_asset_id ON public.profiles(avatar_asset_id);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- C) Table: public.user_preferences
-- Theme mode and brand colors (HEX)
-- ---------------------------------------------------------------------------
CREATE TABLE public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme_mode TEXT NOT NULL DEFAULT 'system' CHECK (theme_mode IN ('light', 'dark', 'system')),
  primary_color TEXT NOT NULL DEFAULT '#05668D' CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color TEXT NOT NULL DEFAULT '#0B132B' CHECK (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  third_color TEXT NOT NULL DEFAULT '#F4F7FB' CHECK (third_color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own preferences"
  ON public.user_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
  ON public.user_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON public.user_preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_user_preferences_updated_at ON public.user_preferences;
CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- D) Storage: private bucket user-assets
-- Path convention: {user_id}/{kind}/{uuid}.{ext}
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-assets',
  'user-assets',
  false,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage RLS: users can only access files under their own folder (first path segment = user_id)
-- Path convention: {user_id}/{kind}/{uuid}.{ext}
DROP POLICY IF EXISTS "profile_module_upload_own_assets" ON storage.objects;
CREATE POLICY "profile_module_upload_own_assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'user-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "profile_module_read_own_assets" ON storage.objects;
CREATE POLICY "profile_module_read_own_assets"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'user-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "profile_module_update_own_assets" ON storage.objects;
CREATE POLICY "profile_module_update_own_assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'user-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'user-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "profile_module_delete_own_assets" ON storage.objects;
CREATE POLICY "profile_module_delete_own_assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'user-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
