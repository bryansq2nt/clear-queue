'use client'

import { useState, useEffect } from 'react'
import { useI18n } from '@/components/I18nProvider'
import { X, Building2 } from 'lucide-react'
import { updateBusinessAction } from '../actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Database } from '@/lib/supabase/types'
import type { SocialLinks } from '../actions'

type Business = Database['public']['Tables']['businesses']['Row']

function getSocialLinks(links: unknown): SocialLinks {
  if (links && typeof links === 'object' && !Array.isArray(links)) return links as SocialLinks
  return {}
}

interface EditBusinessModalProps {
  business: Business | null
  isOpen: boolean
  onClose: () => void
  onUpdated?: () => void
}

export function EditBusinessModal({ business, isOpen, onClose, onUpdated }: EditBusinessModalProps) {
  const { t } = useI18n()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!business) return
    setError(null)
    const form = e.currentTarget
    const formData = new FormData(form)
    setIsSubmitting(true)
    const result = await updateBusinessAction(business.id, formData)
    setIsSubmitting(false)
    if (result.error) {
      setError(result.error)
      return
    }
    onClose()
    onUpdated?.()
  }

  useEffect(() => {
    if (!isOpen) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  if (!isOpen || !business) return null

  const social = getSocialLinks(business.social_links)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-slate-500 to-slate-600 rounded-lg flex items-center justify-center">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{t('businesses.edit_business')}</h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-3">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-2.5 rounded-md">{error}</div>
          )}
          <div>
            <Label htmlFor="eb-name" className="text-sm">{t('businesses.name_label')}</Label>
            <Input id="eb-name" name="name" defaultValue={business.name} required className="mt-1 h-9" />
          </div>
          <div>
            <Label htmlFor="eb-tagline" className="text-sm">{t('businesses.tagline_label')}</Label>
            <Input id="eb-tagline" name="tagline" defaultValue={business.tagline ?? ''} className="mt-1 h-9" />
          </div>
          <div>
            <Label htmlFor="eb-description" className="text-sm">{t('businesses.description_label')}</Label>
            <Textarea id="eb-description" name="description" rows={2} defaultValue={business.description ?? ''} className="mt-1 text-sm" />
          </div>
          <div>
            <Label htmlFor="eb-email" className="text-sm">{t('businesses.business_email_label')}</Label>
            <Input id="eb-email" name="email" type="email" defaultValue={business.email ?? ''} placeholder={t('businesses.business_email_placeholder')} className="mt-1 h-9" />
          </div>
          <div>
            <Label htmlFor="eb-website" className="text-sm">{t('businesses.website_label')}</Label>
            <Input id="eb-website" name="website" type="url" defaultValue={business.website ?? ''} className="mt-1 h-9" />
          </div>
          <div>
            <Label className="text-sm block mb-1">{t('businesses.social_links_label')}</Label>
            <div className="space-y-2">
              {(['instagram', 'facebook', 'tiktok', 'youtube'] as const).map((k) => (
                <Input key={k} name={`social_${k}`} defaultValue={social[k] ?? ''} placeholder={k.charAt(0).toUpperCase() + k.slice(1)} className="h-9" />
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="eb-address_line1" className="text-sm">{t('businesses.address_line1_label')}</Label>
            <Input id="eb-address_line1" name="address_line1" defaultValue={business.address_line1 ?? ''} className="mt-1 h-9" />
          </div>
          <div>
            <Label htmlFor="eb-address_line2" className="text-sm">{t('businesses.address_line2_label')}</Label>
            <Input id="eb-address_line2" name="address_line2" defaultValue={business.address_line2 ?? ''} className="mt-1 h-9" />
          </div>
          <div>
            <Label htmlFor="eb-city" className="text-sm">{t('businesses.city_label')}</Label>
            <Input id="eb-city" name="city" defaultValue={business.city ?? ''} className="mt-1 h-9" />
          </div>
          <div>
            <Label htmlFor="eb-state" className="text-sm">{t('businesses.state_label')}</Label>
            <Input id="eb-state" name="state" defaultValue={business.state ?? ''} className="mt-1 h-9" />
          </div>
          <div>
            <Label htmlFor="eb-postal_code" className="text-sm">{t('businesses.postal_code_label')}</Label>
            <Input id="eb-postal_code" name="postal_code" defaultValue={business.postal_code ?? ''} className="mt-1 h-9" />
          </div>
          <div>
            <Label htmlFor="eb-notes" className="text-sm">{t('businesses.notes_label')}</Label>
            <Textarea id="eb-notes" name="notes" rows={2} defaultValue={business.notes ?? ''} className="mt-1 text-sm" />
          </div>
          <div className="flex gap-2 pt-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-slate-600 to-slate-700 text-white rounded-lg hover:from-slate-700 hover:to-slate-800 disabled:opacity-50 font-medium"
            >
              {isSubmitting ? t('businesses.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
