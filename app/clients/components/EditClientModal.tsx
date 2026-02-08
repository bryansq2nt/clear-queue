'use client'

import { useState, useEffect } from 'react'
import { X, Users } from 'lucide-react'
import { updateClientAction } from '../actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Database } from '@/lib/supabase/types'

type Client = Database['public']['Tables']['clients']['Row']

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'not_specified', label: 'Not specified' },
] as const

interface EditClientModalProps {
  client: Client | null
  isOpen: boolean
  onClose: () => void
  onUpdated?: () => void
}

export function EditClientModal({ client, isOpen, onClose, onUpdated }: EditClientModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const genderValue = client?.gender === 'male' || client?.gender === 'female' ? client.gender : 'not_specified'
  const [gender, setGender] = useState<string>(genderValue)

  useEffect(() => {
    if (client) setGender(client.gender === 'male' || client.gender === 'female' ? client.gender : 'not_specified')
  }, [client])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!client) return
    setError(null)
    const form = e.currentTarget
    const formData = new FormData(form)
    formData.set('gender', gender === 'not_specified' ? '' : gender)
    setIsSubmitting(true)
    const result = await updateClientAction(client.id, formData)
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

  if (!isOpen || !client) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-slate-500 to-slate-600 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Edit Client</h2>
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
            <Label htmlFor="edit-full_name">Full name *</Label>
            <Input
              id="edit-full_name"
              name="full_name"
              defaultValue={client.full_name}
              required
              placeholder="e.g. Jane Doe"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                name="phone"
                type="tel"
                defaultValue={client.phone ?? ''}
                placeholder="+1 234 567 8900"
              />
            </div>
            <div>
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                name="email"
                type="email"
                defaultValue={client.email ?? ''}
                placeholder="jane@example.com"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="edit-gender">Gender</Label>
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger id="edit-gender">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {GENDER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="edit-address_line1">Address line 1</Label>
            <Input
              id="edit-address_line1"
              name="address_line1"
              defaultValue={client.address_line1 ?? ''}
            />
          </div>
          <div>
            <Label htmlFor="edit-address_line2">Address line 2</Label>
            <Input
              id="edit-address_line2"
              name="address_line2"
              defaultValue={client.address_line2 ?? ''}
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="edit-city">City</Label>
              <Input id="edit-city" name="city" defaultValue={client.city ?? ''} />
            </div>
            <div>
              <Label htmlFor="edit-state">State</Label>
              <Input id="edit-state" name="state" defaultValue={client.state ?? ''} />
            </div>
            <div>
              <Label htmlFor="edit-postal_code">Postal code</Label>
              <Input id="edit-postal_code" name="postal_code" defaultValue={client.postal_code ?? ''} />
            </div>
          </div>
          <div>
            <Label htmlFor="edit-preferences">Preferences</Label>
            <Textarea
              id="edit-preferences"
              name="preferences"
              rows={2}
              defaultValue={client.preferences ?? ''}
            />
          </div>
          <div>
            <Label htmlFor="edit-notes">Notes</Label>
            <Textarea id="edit-notes" name="notes" rows={3} defaultValue={client.notes ?? ''} />
          </div>
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-slate-600 to-slate-700 text-white rounded-lg hover:from-slate-700 hover:to-slate-800 disabled:opacity-50 font-medium"
            >
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
