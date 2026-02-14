'use client'

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import {
  getProfileWithAvatar,
  updateProfile,
  uploadUserAsset,
  deleteUserAsset,
  getAssetSignedUrl,
} from './actions'
import { getPreferences, updatePreferences } from '@/app/settings/appearance/actions'
import { TIMEZONE_OPTIONS, CURRENCY_OPTIONS } from '@/lib/validation/profile'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Upload, X } from 'lucide-react'

type ProfileWithAvatar = Awaited<ReturnType<typeof getProfileWithAvatar>>

export default function ProfilePageClient() {
  const [profile, setProfile] = useState<ProfileWithAvatar | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    display_name: '',
    phone: '',
    timezone: 'America/New_York',
    locale: 'es',
    currency: 'USD',
  })

  const loadProfile = useCallback(async () => {
    setIsLoading(true)
    const [p, prefs] = await Promise.all([getProfileWithAvatar(), getPreferences()])
    setProfile(p)
    if (p) {
      setForm((prev) => ({
        display_name: p.display_name,
        phone: p.phone ?? '',
        timezone: p.timezone,
        locale: p.locale,
        currency: prefs?.currency ?? prev.currency,
      }))
      if (p.avatar_asset_id) {
        const url = await getAssetSignedUrl(p.avatar_asset_id)
        setAvatarUrl(url)
      } else {
        setAvatarUrl(null)
      }
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    setIsSaving(true)
    const [profileResult, prefsResult] = await Promise.all([
      updateProfile({
        display_name: form.display_name,
        phone: form.phone || null,
        timezone: form.timezone,
        locale: form.locale,
      }),
      updatePreferences({ currency: form.currency }),
    ])
    setIsSaving(false)
    const err = profileResult.error ?? prefsResult.error
    if (err) {
      setError(err)
      return
    }
    setSuccess(true)
    if (profileResult.data) setProfile({ ...profileResult.data, avatar_asset: profile?.avatar_asset ?? null })
    setTimeout(() => setSuccess(false), 3000)
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('kind', 'avatar')
    const result = await uploadUserAsset(formData)
    if (result.error) {
      setError(result.error)
      return
    }
    if (result.data) {
      await updateProfile({ avatar_asset_id: result.data.id })
      const url = await getAssetSignedUrl(result.data.id)
      setAvatarUrl(url)
      setProfile((prev) =>
        prev ? { ...prev, avatar_asset_id: result.data!.id, avatar_asset: result.data! } : prev
      )
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleRemoveAvatar() {
    if (!profile?.avatar_asset_id) return
    setError(null)
    const result = await deleteUserAsset(profile.avatar_asset_id)
    if (result.error) {
      setError(result.error)
      return
    }
    setAvatarUrl(null)
    setProfile((prev) => (prev ? { ...prev, avatar_asset_id: null, avatar_asset: null } : prev))
  }

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground">Profile</h1>
        <p className="text-muted-foreground mt-1">Manage your display name, contact info, and avatar.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
            Profile updated successfully.
          </div>
        )}

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground mb-4">Avatar</h2>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-muted overflow-hidden flex items-center justify-center">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
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
                Upload
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-destructive/10 text-destructive rounded-lg text-sm font-medium hover:bg-destructive/20"
                >
                  <X className="w-4 h-4" />
                  Remove
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">PNG, JPEG, WebP. Max 5MB.</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Profile info</h2>
          <div>
            <Label htmlFor="display_name">Display name</Label>
            <Input
              id="display_name"
              required
              placeholder="Your display name"
              value={form.display_name}
              onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="phone">Phone (optional)</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="+1 234 567 8900"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="timezone">Timezone</Label>
            <Select
              value={form.timezone}
              onValueChange={(v) => setForm((f) => ({ ...f, timezone: v }))}
            >
              <SelectTrigger id="timezone" className="mt-1">
                <SelectValue placeholder="Select timezone" />
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
            <Label htmlFor="locale">Locale</Label>
            <Select
              value={form.locale}
              onValueChange={(v) => setForm((f) => ({ ...f, locale: v }))}
            >
              <SelectTrigger id="locale" className="mt-1">
                <SelectValue placeholder="Select locale" />
              </SelectTrigger>
              <SelectContent className="bg-popover text-popover-foreground z-[100]">
                <SelectItem value="es">Spanish</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="currency">Currency</Label>
            <Select
              value={form.currency}
              onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}
            >
              <SelectTrigger id="currency" className="mt-1">
                <SelectValue placeholder="Select currency" />
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
          Save changes
        </button>
      </form>
    </div>
  )
}
