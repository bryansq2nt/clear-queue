'use client'

import { Building2, Globe, MoreVertical, Edit, Trash2, Mail, MapPin, Copy, Send } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { deleteBusinessAction } from '../actions'
import { Database } from '@/lib/supabase/types'
import type { SocialLinks } from '../actions'

function EmailAction({ email }: { email: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
        <button
          type="button"
          className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white"
        >
          <Mail className="w-3.5 h-3.5" />
          <span className="truncate">{email}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => void navigator.clipboard.writeText(email)}>
          <Copy className="w-4 h-4 mr-2" />
          Copy email
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={`mailto:${email}`} onClick={(e) => e.stopPropagation()}>
            <Send className="w-4 h-4 mr-2" />
            Send email
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type Business = Database['public']['Tables']['businesses']['Row']

const SOCIAL_ICONS: { key: keyof SocialLinks; label: string; href?: string }[] = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'youtube', label: 'YouTube' },
]

function getSocialLinks(links: unknown): SocialLinks {
  if (links && typeof links === 'object' && !Array.isArray(links)) {
    return links as SocialLinks
  }
  return {}
}

interface BusinessCardProps {
  business: Business
  onDeleted?: () => void
  onEdit?: (business: Business) => void
}

export function BusinessCard({ business, onDeleted, onEdit }: BusinessCardProps) {
  const social = getSocialLinks(business.social_links)

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm(`Delete "${business.name}"? This cannot be undone.`)) return
    const { error } = await deleteBusinessAction(business.id)
    if (error) {
      alert(error)
      return
    }
    onDeleted?.()
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md transition-all relative group">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
            {business.name}
          </h3>
          {business.tagline && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">
              {business.tagline}
            </p>
          )}
          {business.email && (
            <div className="mt-1">
              <EmailAction email={business.email} />
            </div>
          )}
          {business.website && (
            <a
              href={business.website.startsWith('http') ? business.website : `https://${business.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              <Globe className="w-3.5 h-3.5" />
              <span className="truncate">{business.website}</span>
            </a>
          )}
          {Object.keys(social).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {SOCIAL_ICONS.filter((s) => social[s.key]).map((s) => (
                <a
                  key={s.key}
                  href={social[s.key]!.startsWith('http') ? social[s.key]! : `https://${social[s.key]}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  {s.label}
                </a>
              ))}
            </div>
          )}
          {(() => {
            const parts = [
              business.address_line1,
              business.address_line2,
              [business.city, business.state, business.postal_code].filter(Boolean).join(', '),
            ].filter(Boolean)
            const fullAddress = parts.join(', ')
            const mapsUrl = fullAddress
              ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`
              : null
            if (!mapsUrl) return null
            return (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                <MapPin className="w-3.5 h-3.5" />
                <span className="line-clamp-1">{fullAddress}</span>
              </a>
            )
          })()}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
            <button
              className="p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-100 dark:hover:bg-gray-700 flex-shrink-0"
              onClick={(e) => e.preventDefault()}
            >
              <MoreVertical className="w-4 h-4 text-gray-500" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onEdit && (
              <DropdownMenuItem onClick={() => onEdit(business)}>
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={handleDelete} className="text-red-600 focus:text-red-600">
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
