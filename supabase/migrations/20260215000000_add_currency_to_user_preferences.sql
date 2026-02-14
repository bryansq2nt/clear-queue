-- Add currency to user_preferences (Profile tab)
-- ISO 4217 codes, default USD
ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'EUR', 'GBP', 'CAD', 'MXN'));
