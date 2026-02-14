'use client'

import { useState, useEffect } from 'react'
import { X, Users } from 'lucide-react'
import { useI18n } from '@/components/I18nProvider'
import { createClientAction } from '../actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface CreateClientModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated?: () => void
}

export function CreateClientModal({ isOpen, onClose, onCreated }: CreateClientModalProps) {
  const { t } = useI18n()
  const GENDER_OPTIONS = [
    { value: 'male', label: t('clients.gender_male') },
    { value: 'female', label: t('clients.gender_female') },
    { value: 'not_specified', label: t('clients.gender_not_specified') },
  ]
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gender, setGender] = useState<string>('not_specified')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    const form = e.currentTarget
    const formData = new FormData(form)
    formData.set('gender', gender === 'not_specified' ? '' : gender)
    setIsSubmitting(true)
    const result = await createClientAction(formData)
    setIsSubmitting(false)
    if (result.error) {
      setError(result.error)
      return
    }
    form.reset()
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
              <Users className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{t('clients.new_client')}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">{error}</div>
          )}
          <div>
            <Label htmlFor="full_name">{t('clients.full_name')}</Label>
            <Input id="full_name" name="full_name" required placeholder={t('clients.full_name_placeholder')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="phone">{t('clients.phone')}</Label>
              <Input id="phone" name="phone" type="tel" placeholder="+1 234 567 8900" />
            </div>
            <div>
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input id="email" name="email" type="email" placeholder="jane@example.com" />
            </div>
          </div>
          <div>
            <Label htmlFor="gender">{t('clients.gender')}</Label>
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger id="gender">
                <SelectValue placeholder={t('common.select')} />
              </SelectTrigger>
              <SelectContent>
                {GENDER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="address_line1">{t('clients.address_line1')}</Label>
            <Input id="address_line1" name="address_line1" placeholder={t('clients.address_placeholder')} />
          </div>
          <div>
            <Label htmlFor="address_line2">{t('clients.address_line2')}</Label>
            <Input id="address_line2" name="address_line2" placeholder={t('clients.apt_placeholder')} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="city">{t('clients.city')}</Label>
              <Input id="city" name="city" />
            </div>
            <div>
              <Label htmlFor="state">{t('clients.state')}</Label>
              <Input id="state" name="state" />
            </div>
            <div>
              <Label htmlFor="postal_code">{t('clients.postal_code')}</Label>
              <Input id="postal_code" name="postal_code" />
            </div>
          </div>
          <div>
            <Label htmlFor="preferences">{t('clients.preferences')}</Label>
            <Textarea id="preferences" name="preferences" rows={2} placeholder={t('clients.optional')} />
          </div>
          <div>
            <Label htmlFor="notes">{t('clients.notes')}</Label>
            <Textarea id="notes" name="notes" rows={3} placeholder={t('clients.optional')} />
          </div>
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-slate-600 to-slate-700 text-white rounded-lg hover:from-slate-700 hover:to-slate-800 disabled:opacity-50 font-medium"
            >
              {isSubmitting ? t('clients.creating') : t('clients.create_client')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
