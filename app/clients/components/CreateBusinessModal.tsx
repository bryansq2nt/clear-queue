'use client'

import { useState, useEffect } from 'react'
import { X, Building2 } from 'lucide-react'
import { createBusinessAction } from '../actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface CreateBusinessModalProps {
  clientId: string
  isOpen: boolean
  onClose: () => void
  onCreated?: () => void
}

export function CreateBusinessModal({ clientId, isOpen, onClose, onCreated }: CreateBusinessModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
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
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Add Business</h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">{error}</div>
          )}
          <div>
            <Label htmlFor="b-name">Name *</Label>
            <Input id="b-name" name="name" required placeholder="Business name" />
          </div>
          <div>
            <Label htmlFor="b-tagline">Tagline</Label>
            <Input id="b-tagline" name="tagline" placeholder="Short tagline" />
          </div>
          <div>
            <Label htmlFor="b-description">Description</Label>
            <Textarea id="b-description" name="description" rows={2} placeholder="Optional" />
          </div>
          <div>
            <Label htmlFor="b-email">Business email *</Label>
            <Input id="b-email" name="email" type="email" required placeholder="contact@business.com" />
          </div>
          <div>
            <Label htmlFor="b-website">Website</Label>
            <Input id="b-website" name="website" type="url" placeholder="https://..." />
          </div>
          <div>
            <Label className="mb-2 block">Social links</Label>
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
            <Label htmlFor="b-address_line1">Address line 1</Label>
            <Input id="b-address_line1" name="address_line1" />
          </div>
          <div>
            <Label htmlFor="b-address_line2">Address line 2</Label>
            <Input id="b-address_line2" name="address_line2" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="b-city">City</Label>
              <Input id="b-city" name="city" />
            </div>
            <div>
              <Label htmlFor="b-state">State</Label>
              <Input id="b-state" name="state" />
            </div>
            <div>
              <Label htmlFor="b-postal_code">Postal code</Label>
              <Input id="b-postal_code" name="postal_code" />
            </div>
          </div>
          <div>
            <Label htmlFor="b-notes">Notes</Label>
            <Textarea id="b-notes" name="notes" rows={2} />
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-slate-600 to-slate-700 text-white rounded-lg hover:from-slate-700 hover:to-slate-800 disabled:opacity-50 font-medium"
            >
              {isSubmitting ? 'Creating...' : 'Create Business'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
