'use client'

import { useState, useEffect } from 'react'
import { X, Building2 } from 'lucide-react'
import { useI18n } from '@/components/I18nProvider'
import { createBusinessAction, getClients } from '../actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Database } from '@/lib/supabase/types'

type Client = Database['public']['Tables']['clients']['Row']

interface CreateBusinessModalProps {
  /** When set (e.g. from client detail page), client is fixed and dropdown is hidden. When undefined (e.g. from businesses list), show client dropdown. */
  clientId?: string
  isOpen: boolean
  onClose: () => void
  onCreated?: () => void
}

export function CreateBusinessModal({ clientId: fixedClientId, isOpen, onClose, onCreated }: CreateBusinessModalProps) {
  const { t } = useI18n()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClientId, setSelectedClientId] = useState<string>('')

  const showClientDropdown = fixedClientId === undefined

  useEffect(() => {
    if (isOpen && showClientDropdown) getClients().then(setClients)
  }, [isOpen, showClientDropdown])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const clientId = fixedClientId ?? selectedClientId
    if (!clientId) {
      setError(t('businesses.error_select_client'))
      return
    }
    setError(null)
    const form = e.currentTarget
    const formData = new FormData(form)
    setIsSubmitting(true)
    const result = await createBusinessAction(clientId, formData)
    setIsSubmitting(false)
    if (result.error) {
      setError(result.error)
      return
    }
    form.reset()
    setSelectedClientId('')
    onClose()
    onCreated?.()
  }

  useEffect(() => {
    if (!isOpen) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-slate-500 to-slate-600 rounded-lg flex items-center justify-center">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{t('businesses.create_modal_title')}</h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">{error}</div>
          )}
          {showClientDropdown && (
            <div>
              <Label htmlFor="b-client">{t('businesses.client_label')}</Label>
              <Select value={selectedClientId} onValueChange={setSelectedClientId} required>
                <SelectTrigger id="b-client">
                  <SelectValue placeholder={t('businesses.select_client')} />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label htmlFor="b-name">{t('businesses.name_label')}</Label>
            <Input id="b-name" name="name" required placeholder={t('businesses.business_name_placeholder')} />
          </div>
          <div>
            <Label htmlFor="b-tagline">{t('businesses.tagline_label')}</Label>
            <Input id="b-tagline" name="tagline" placeholder={t('businesses.tagline_placeholder')} />
          </div>
          <div>
            <Label htmlFor="b-description">{t('businesses.description_label')}</Label>
            <Textarea id="b-description" name="description" rows={2} placeholder={t('businesses.optional_placeholder')} />
          </div>
          <div>
            <Label htmlFor="b-email">{t('businesses.business_email_label')}</Label>
            <Input id="b-email" name="email" type="email" placeholder={t('businesses.business_email_placeholder')} />
          </div>
          <div>
            <Label htmlFor="b-website">{t('businesses.website_label')}</Label>
            <Input id="b-website" name="website" type="url" placeholder={t('businesses.website_placeholder')} />
          </div>
          <div>
            <Label className="mb-2 block">{t('businesses.social_links_label')}</Label>
            <div className="grid grid-cols-2 gap-2">
              {['instagram', 'facebook', 'tiktok', 'youtube'].map((k) => (
                <Input
                  key={k}
                  name={`social_${k}`}
                  placeholder={k.charAt(0).toUpperCase() + k.slice(1)}
                />
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="b-address_line1">{t('businesses.address_line1_label')}</Label>
            <Input id="b-address_line1" name="address_line1" />
          </div>
          <div>
            <Label htmlFor="b-address_line2">{t('businesses.address_line2_label')}</Label>
            <Input id="b-address_line2" name="address_line2" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="b-city">{t('businesses.city_label')}</Label>
              <Input id="b-city" name="city" />
            </div>
            <div>
              <Label htmlFor="b-state">{t('businesses.state_label')}</Label>
              <Input id="b-state" name="state" />
            </div>
            <div>
              <Label htmlFor="b-postal_code">{t('businesses.postal_code_label')}</Label>
              <Input id="b-postal_code" name="postal_code" />
            </div>
          </div>
          <div>
            <Label htmlFor="b-notes">{t('businesses.notes_label')}</Label>
            <Textarea id="b-notes" name="notes" rows={2} />
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-slate-600 to-slate-700 text-white rounded-lg hover:from-slate-700 hover:to-slate-800 disabled:opacity-50 font-medium"
            >
              {isSubmitting ? t('businesses.creating') : t('businesses.create_business_btn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
