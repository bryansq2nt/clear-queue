'use client';

import { FormEvent, useRef, useState } from 'react';
import Image from 'next/image';
import {
  updateProfile,
  uploadUserAsset,
  deleteUserAsset,
  getAssetSignedUrl,
} from './actions';
import { updatePreferences } from '@/app/settings/appearance/actions';
import type { getProfileWithAvatar } from './actions';
import type { getPreferences } from '@/app/settings/appearance/actions';
import { TIMEZONE_OPTIONS, CURRENCY_OPTIONS } from '@/lib/validation/profile';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Upload, X } from 'lucide-react';
import { useI18n } from '@/components/I18nProvider';

type ProfileWithAvatar = Awaited<ReturnType<typeof getProfileWithAvatar>>;
type Preferences = Awaited<ReturnType<typeof getPreferences>>;

type ProfilePageClientProps = {
  profile: ProfileWithAvatar | null;
  preferences: Preferences;
  initialAvatarUrl: string | null;
};

function defaultForm(
  profile: ProfileWithAvatar | null,
  preferences: Preferences
) {
  return {
    display_name: profile?.display_name ?? '',
    phone: profile?.phone ?? '',
    timezone: profile?.timezone ?? 'America/New_York',
    locale: profile?.locale ?? 'es',
    currency: preferences?.currency ?? 'USD',
  };
}

export default function ProfilePageClient({
  profile: initialProfile,
  preferences: initialPreferences,
  initialAvatarUrl,
}: ProfilePageClientProps) {
  const { t, setPrefs } = useI18n();
  const [profile, setProfile] = useState<ProfileWithAvatar | null>(
    initialProfile
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState(() =>
    defaultForm(initialProfile, initialPreferences)
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setIsSaving(true);
    const [profileResult, prefsResult] = await Promise.all([
      updateProfile({
        display_name: form.display_name,
        phone: form.phone || null,
        timezone: form.timezone,
        locale: form.locale,
      }),
      updatePreferences({ currency: form.currency }),
    ]);
    setIsSaving(false);
    const err = profileResult.error ?? prefsResult.error;
    if (err) {
      setError(err);
      return;
    }
    setSuccess(true);
    setPrefs({ locale: form.locale as 'en' | 'es', currency: form.currency });
    if (profileResult.data)
      setProfile({
        ...profileResult.data,
        avatar_asset: profile?.avatar_asset ?? null,
      });
    setTimeout(() => setSuccess(false), 3000);
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('kind', 'avatar');
    const result = await uploadUserAsset(formData);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.data) {
      await updateProfile({ avatar_asset_id: result.data.id });
      const url = await getAssetSignedUrl(result.data.id);
      setAvatarUrl(url);
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              avatar_asset_id: result.data!.id,
              avatar_asset: result.data!,
            }
          : prev
      );
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleRemoveAvatar() {
    if (!profile?.avatar_asset_id) return;
    setError(null);
    const result = await deleteUserAsset(profile.avatar_asset_id);
    if (result.error) {
      setError(result.error);
      return;
    }
    setAvatarUrl(null);
    setProfile((prev) =>
      prev ? { ...prev, avatar_asset_id: null, avatar_asset: null } : prev
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground">
          {t('profile.title')}
        </h1>
        <p className="text-muted-foreground mt-1">{t('profile.subtitle')}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
            {t('profile.update_success')}
          </div>
        )}

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            {t('profile.avatar')}
          </h2>
          <div className="flex items-center gap-4">
            <div className="relative w-20 h-20 rounded-full bg-muted overflow-hidden flex items-center justify-center">
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt="Avatar"
                  fill
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <span className="text-2xl text-muted-foreground font-medium">
                  {form.display_name?.charAt(0)?.toUpperCase() ?? '?'}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-sm font-medium hover:bg-secondary/80"
              >
                <Upload className="w-4 h-4" />
                {t('common.upload')}
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-destructive/10 text-destructive rounded-lg text-sm font-medium hover:bg-destructive/20"
                >
                  <X className="w-4 h-4" />
                  {t('common.remove')}
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {t('profile.avatar_hint')}
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-foreground">
            {t('profile.profile_info')}
          </h2>
          <div>
            <Label htmlFor="display_name">{t('profile.display_name')}</Label>
            <Input
              id="display_name"
              required
              placeholder={t('profile.display_name_placeholder')}
              value={form.display_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, display_name: e.target.value }))
              }
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="phone">{t('profile.phone')}</Label>
            <Input
              id="phone"
              type="tel"
              placeholder={t('profile.phone_placeholder')}
              value={form.phone}
              onChange={(e) =>
                setForm((f) => ({ ...f, phone: e.target.value }))
              }
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="timezone">{t('profile.timezone')}</Label>
            <Select
              value={form.timezone}
              onValueChange={(v) => setForm((f) => ({ ...f, timezone: v }))}
            >
              <SelectTrigger id="timezone" className="mt-1">
                <SelectValue placeholder={t('profile.timezone_placeholder')} />
              </SelectTrigger>
              <SelectContent className="bg-popover text-popover-foreground z-[100]">
                {TIMEZONE_OPTIONS.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="locale">{t('profile.language')}</Label>
            <Select
              value={form.locale}
              onValueChange={(v) => {
                setForm((f) => ({ ...f, locale: v }));
                setPrefs({ locale: v as 'en' | 'es' });
                updateProfile({ locale: v }).catch(() => {});
              }}
            >
              <SelectTrigger id="locale" className="mt-1">
                <SelectValue placeholder={t('profile.locale_placeholder')} />
              </SelectTrigger>
              <SelectContent className="bg-popover text-popover-foreground z-[100]">
                <SelectItem value="es">{t('profile.spanish')}</SelectItem>
                <SelectItem value="en">{t('profile.english')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="currency">{t('profile.currency')}</Label>
            <Select
              value={form.currency}
              onValueChange={(v) => {
                setForm((f) => ({ ...f, currency: v }));
                setPrefs({ currency: v });
                updatePreferences({ currency: v }).catch(() => {});
              }}
            >
              <SelectTrigger id="currency" className="mt-1">
                <SelectValue placeholder={t('profile.currency_placeholder')} />
              </SelectTrigger>
              <SelectContent className="bg-popover text-popover-foreground z-[100]">
                {CURRENCY_OPTIONS.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <button
          type="submit"
          disabled={isSaving}
          className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
        >
          {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
          {t('profile.save_changes')}
        </button>
      </form>
    </div>
  );
}
