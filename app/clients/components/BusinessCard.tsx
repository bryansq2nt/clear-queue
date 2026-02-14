'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Building2, Globe, MoreVertical, Edit, Trash2, Mail, MapPin, Copy, Send, User } from 'lucide-react'
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
  /** When set (e.g. on global businesses list), show client name and link to client */
  clientName?: string | null
  clientId?: string
  /** When true, clicking the card opens the business detail page (default true) */
  linkToDetail?: boolean
}

export function BusinessCard({ business, onDeleted, onEdit, clientName, clientId, linkToDetail = true }: BusinessCardProps) {
  const router = useRouter()
  const social = getSocialLinks(business.social_links)

  const handleCardClick = (e: React.MouseEvent) => {
    if (!linkToDetail) return
    if ((e.target as HTMLElement).closest('button, a, [role="menuitem"]')) return
    router.push(`/businesses/${business.id}`)
  }

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
    <div
      role={linkToDetail ? 'button' : undefined}
      tabIndex={linkToDetail ? 0 : undefined}
      onClick={linkToDetail ? handleCardClick : undefined}
      onKeyDown={linkToDetail ? (e) => e.key === 'Enter' && handleCardClick(e as unknown as React.MouseEvent) : undefined}
      className={`bg-card rounded-lg shadow-sm border border-border p-5 transition-all relative group ${linkToDetail ? 'cursor-pointer hover:shadow-md' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
            {business.name}
          </h3>
          {clientId && (
            <Link
              href={`/clients/${clientId}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 mt-0.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            >
              <User className="w-3.5 h-3.5" />
              <span className="truncate">{clientName || 'View client'}</span>
            </Link>
          )}
          {business.tagline && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">
              {business.tagline}
            </p>
          )}
          {business.email && (
            <div className="mt-1" onClick={(e) => e.stopPropagation()}>
              <EmailAction email={business.email} />
            </div>
          )}
          {business.website && (
            <a
              href={business.website.startsWith('http') ? business.website : `https://${business.website}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              <Globe className="w-3.5 h-3.5" />
              <span className="truncate">{business.website}</span>
            </a>
          )}
          {Object.keys(social).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
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
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                <MapPin className="w-3.5 h-3.5" />
                <span className="line-clamp-1">{fullAddress}</span>
              </a>
            )
          })()}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-100 dark:hover:bg-gray-700 flex-shrink-0"
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
