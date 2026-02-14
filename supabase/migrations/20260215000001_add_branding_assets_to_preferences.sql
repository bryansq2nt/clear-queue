-- Add company_logo and cover_image asset references to user_preferences
ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS company_logo_asset_id UUID REFERENCES public.user_assets(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS cover_image_asset_id UUID REFERENCES public.user_assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_preferences_company_logo ON public.user_preferences(company_logo_asset_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_cover_image ON public.user_preferences(cover_image_asset_id);
