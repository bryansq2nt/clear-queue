'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useI18n } from '@/components/I18nProvider'
import { getPreferences, updatePreferences } from './actions'
import { uploadUserAsset, deleteUserAsset, getAssetSignedUrl } from '@/app/settings/profile/actions'
import { applyTheme, saveToStorage } from '@/lib/theme'
import { THEME_MODES, type ThemeMode } from '@/lib/validation/colors'
import { Loader2, Upload, X } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

type Preferences = Awaited<ReturnType<typeof getPreferences>>

const COLOR_PRESETS = [
  { primary: '#05668D', secondary: '#0B132B', third: '#F4F7FB', labelKey: 'preset_default' },
  { primary: '#059669', secondary: '#064e3b', third: '#ecfdf5', labelKey: 'preset_emerald' },
  { primary: '#7c3aed', secondary: '#4c1d95', third: '#f5f3ff', labelKey: 'preset_violet' },
  { primary: '#dc2626', secondary: '#7f1d1d', third: '#fef2f2', labelKey: 'preset_rose' },
  { primary: '#2563eb', secondary: '#1e3a8a', third: '#eff6ff', labelKey: 'preset_blue' },
]

const THEME_MODE_KEYS: Record<ThemeMode, string> = {
  light: 'theme_light',
  dark: 'theme_dark',
  system: 'theme_system',
}

export default function AppearancePageClient() {
  const { t } = useI18n()
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null)
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({
    theme_mode: 'system' as ThemeMode,
    primary_color: '#05668D',
    secondary_color: '#0B132B',
    third_color: '#F4F7FB',
  })

  const loadPrefs = useCallback(async () => {
    setIsLoading(true)
    const p = await getPreferences()
    setPrefs(p)
    if (p) {
      setForm({
        theme_mode: p.theme_mode as ThemeMode,
        primary_color: p.primary_color,
        secondary_color: p.secondary_color,
        third_color: p.third_color,
      })
      if (p.company_logo_asset_id) {
        const url = await getAssetSignedUrl(p.company_logo_asset_id)
        setCompanyLogoUrl(url)
      } else setCompanyLogoUrl(null)
      if (p.cover_image_asset_id) {
        const url = await getAssetSignedUrl(p.cover_image_asset_id)
        setCoverImageUrl(url)
      } else setCoverImageUrl(null)
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    loadPrefs()
  }, [loadPrefs])

  useEffect(() => {
    applyTheme({
      theme_mode: form.theme_mode,
      primary_color: form.primary_color,
      secondary_color: form.secondary_color,
      third_color: form.third_color,
    })
  }, [form.theme_mode, form.primary_color, form.secondary_color, form.third_color])

  async function handleThemeModeClick(mode: ThemeMode) {
    setForm((f) => ({ ...f, theme_mode: mode }))
    const prefs = {
      theme_mode: mode,
      primary_color: form.primary_color,
      secondary_color: form.secondary_color,
      third_color: form.third_color,
    }
    saveToStorage(prefs)
    const result = await updatePreferences({ theme_mode: mode })
    if (result.data) setPrefs(result.data)
  }

  async function handleSave() {
    setError(null)
    setSuccess(false)
    setIsSaving(true)
    const result = await updatePreferences({
      theme_mode: form.theme_mode,
      primary_color: form.primary_color,
      secondary_color: form.secondary_color,
      third_color: form.third_color,
    })
    setIsSaving(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setSuccess(true)
    if (result.data) {
      setPrefs(result.data)
      const prefs = {
        theme_mode: result.data.theme_mode,
        primary_color: result.data.primary_color,
        secondary_color: result.data.secondary_color,
        third_color: result.data.third_color,
      }
      saveToStorage(prefs)
      applyTheme(prefs)
    }
    setTimeout(() => setSuccess(false), 3000)
  }

  function applyPreset(preset: (typeof COLOR_PRESETS)[number]) {
    setForm({
      ...form,
      primary_color: preset.primary,
      secondary_color: preset.secondary,
      third_color: preset.third,
    })
  }

  const isValidHex = (s: string) => /^#[0-9A-Fa-f]{6}$/.test(s)

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('kind', 'company_logo')
    const result = await uploadUserAsset(formData)
    if (result.error) {
      setError(result.error)
      return
    }
    if (result.data) {
      const res = await updatePreferences({ company_logo_asset_id: result.data.id })
      if (res.error) {
        setError(res.error)
        return
      }
      const url = await getAssetSignedUrl(result.data.id)
      setCompanyLogoUrl(url)
      setPrefs((prev) => (prev ? { ...prev, company_logo_asset_id: result.data!.id } : prev))
    }
    if (logoInputRef.current) logoInputRef.current.value = ''
  }

  async function handleRemoveLogo() {
    if (!prefs?.company_logo_asset_id) return
    setError(null)
    const result = await deleteUserAsset(prefs.company_logo_asset_id)
    if (result.error) {
      setError(result.error)
      return
    }
    setCompanyLogoUrl(null)
    setPrefs((prev) => (prev ? { ...prev, company_logo_asset_id: null } : prev))
  }

  async function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('kind', 'cover_image')
    const result = await uploadUserAsset(formData)
    if (result.error) {
      setError(result.error)
      return
    }
    if (result.data) {
      const res = await updatePreferences({ cover_image_asset_id: result.data.id })
      if (res.error) {
        setError(res.error)
        return
      }
      const url = await getAssetSignedUrl(result.data.id)
      setCoverImageUrl(url)
      setPrefs((prev) => (prev ? { ...prev, cover_image_asset_id: result.data!.id } : prev))
    }
    if (coverInputRef.current) coverInputRef.current.value = ''
  }

  async function handleRemoveCover() {
    if (!prefs?.cover_image_asset_id) return
    setError(null)
    const result = await deleteUserAsset(prefs.cover_image_asset_id)
    if (result.error) {
      setError(result.error)
      return
    }
    setCoverImageUrl(null)
    setPrefs((prev) => (prev ? { ...prev, cover_image_asset_id: null } : prev))
  }

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground">{t('settings.appearance')}</h1>
        <p className="text-muted-foreground mt-1">{t('settings.appearance_subtitle')}</p>
      </div>

      <div className="space-y-6">
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
            {t('settings.appearance_updated')}
          </div>
        )}

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground mb-4">{t('settings.theme_mode')}</h2>
          <div className="flex gap-2">
            {THEME_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => handleThemeModeClick(mode)}
                className={`px-4 py-2 rounded-lg text-sm font-medium capitalize ${
                  form.theme_mode === mode
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                {t(`settings.${THEME_MODE_KEYS[mode]}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground mb-4">{t('settings.company_logo')}</h2>
          <div className="flex items-center gap-4">
            <div className="relative w-20 h-20 rounded-lg bg-muted overflow-hidden flex items-center justify-center border border-border">
              {companyLogoUrl ? (
                <Image src={companyLogoUrl} alt={t('settings.company_logo')} fill className="object-contain" unoptimized />
              ) : (
                <span className="text-sm text-muted-foreground">{t('settings.no_logo')}</span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                className="hidden"
                onChange={handleLogoChange}
              />
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-sm font-medium hover:bg-secondary/80"
              >
                <Upload className="w-4 h-4" />
                {t('common.upload')}
              </button>
              {companyLogoUrl && (
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-destructive/10 text-destructive rounded-lg text-sm font-medium hover:bg-destructive/20"
                >
                  <X className="w-4 h-4" />
                  {t('common.remove')}
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">{t('settings.image_hint')}</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground mb-4">{t('settings.cover_image')}</h2>
          <div className="flex items-center gap-4">
            <div className="relative w-full max-w-xs h-24 rounded-lg bg-muted overflow-hidden flex items-center justify-center border border-border">
              {coverImageUrl ? (
                <Image src={coverImageUrl} alt={t('settings.cover_image')} fill className="object-cover" unoptimized />
              ) : (
                <span className="text-sm text-muted-foreground">{t('settings.no_cover')}</span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                ref={coverInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                className="hidden"
                onChange={handleCoverChange}
              />
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-sm font-medium hover:bg-secondary/80"
              >
                <Upload className="w-4 h-4" />
                {t('common.upload')}
              </button>
              {coverImageUrl && (
                <button
                  type="button"
                  onClick={handleRemoveCover}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-destructive/10 text-destructive rounded-lg text-sm font-medium hover:bg-destructive/20"
                >
                  <X className="w-4 h-4" />
                  {t('common.remove')}
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">{t('settings.image_hint')}</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground mb-4">{t('settings.brand_colors')}</h2>
          <p className="text-sm text-muted-foreground mb-4">{t('settings.preset_swatches')}</p>
          <div className="flex flex-wrap gap-2 mb-6">
            {COLOR_PRESETS.map((preset) => (
              <button
                key={preset.labelKey}
                type="button"
                onClick={() => applyPreset(preset)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-primary/50 bg-background"
              >
                <span
                  className="w-6 h-6 rounded-full border border-border"
                  style={{ backgroundColor: preset.primary }}
                />
                <span className="text-sm text-foreground">{t(`settings.${preset.labelKey}`)}</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="mb-1">{t('settings.color_primary')}</Label>
              <div className="flex gap-2 mt-1">
                <input
                  type="color"
                  value={isValidHex(form.primary_color) ? form.primary_color : '#05668D'}
                  onChange={(e) => setForm((f) => ({ ...f, primary_color: e.target.value }))}
                  className="w-10 h-10 rounded border border-border cursor-pointer bg-background"
                />
                <Input
                  value={form.primary_color}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v.startsWith('#') && v.length <= 7) setForm((f) => ({ ...f, primary_color: v }))
                  }}
                  className="flex-1 font-mono"
                  placeholder="#05668D"
                />
              </div>
            </div>
            <div>
              <Label className="mb-1">{t('settings.color_secondary')}</Label>
              <div className="flex gap-2 mt-1">
                <input
                  type="color"
                  value={isValidHex(form.secondary_color) ? form.secondary_color : '#0B132B'}
                  onChange={(e) => setForm((f) => ({ ...f, secondary_color: e.target.value }))}
                  className="w-10 h-10 rounded border border-border cursor-pointer bg-background"
                />
                <Input
                  value={form.secondary_color}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v.startsWith('#') && v.length <= 7) setForm((f) => ({ ...f, secondary_color: v }))
                  }}
                  className="flex-1 font-mono"
                  placeholder="#0B132B"
                />
              </div>
            </div>
            <div>
              <Label className="mb-1">{t('settings.color_third')}</Label>
              <div className="flex gap-2 mt-1">
                <input
                  type="color"
                  value={isValidHex(form.third_color) ? form.third_color : '#F4F7FB'}
                  onChange={(e) => setForm((f) => ({ ...f, third_color: e.target.value }))}
                  className="w-10 h-10 rounded border border-border cursor-pointer bg-background"
                />
                <Input
                  value={form.third_color}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v.startsWith('#') && v.length <= 7) setForm((f) => ({ ...f, third_color: v }))
                  }}
                  className="flex-1 font-mono"
                  placeholder="#F4F7FB"
                />
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 rounded-lg border border-border bg-muted/50">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">{t('settings.live_preview')}</p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="px-4 py-2 rounded-lg font-medium text-white"
                style={{ backgroundColor: form.primary_color }}
              >
                {t('settings.preview_primary_button')}
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg font-medium"
                style={{
                  backgroundColor: form.third_color,
                  color: form.secondary_color,
                  borderWidth: 1,
                  borderColor: form.primary_color,
                }}
              >
                {t('settings.preview_secondary_button')}
              </button>
              <a
                href="#"
                className="px-4 py-2 font-medium hover:underline"
                style={{ color: form.primary_color }}
              >
                {t('settings.preview_link')}
              </a>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={
            isSaving ||
            !isValidHex(form.primary_color) ||
            !isValidHex(form.secondary_color) ||
            !isValidHex(form.third_color)
          }
          className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
        >
          {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
          {t('profile.save_changes')}
        </button>
      </div>
    </div>
  )
}
