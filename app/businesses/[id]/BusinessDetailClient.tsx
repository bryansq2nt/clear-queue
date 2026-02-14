'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/I18nProvider'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/types'
import { DetailLayout } from '@/components/DetailLayout'
import { getBusinessById, deleteBusinessAction } from '@/app/clients/actions'
import { EditBusinessModal } from '@/app/clients/components/EditBusinessModal'
import {
  ArrowLeft,
  Building2,
  User,
  Mail,
  Globe,
  MapPin,
  StickyNote,
  Edit,
  Copy,
  Send,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { SocialLinks } from '@/app/clients/actions'

type Project = Database['public']['Tables']['projects']['Row']
type Business = Database['public']['Tables']['businesses']['Row']

const SOCIAL_ICONS: { key: keyof SocialLinks; label: string }[] = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'youtube', label: 'YouTube' },
]

function getSocialLinks(links: unknown): SocialLinks {
  if (links && typeof links === 'object' && !Array.isArray(links)) return links as SocialLinks
  return {}
}

interface BusinessDetailClientProps {
  businessId: string
  initialBusiness: Business
  clientName: string | null
}

export default function BusinessDetailClient({
  businessId,
  initialBusiness,
  clientName,
}: BusinessDetailClientProps) {
  const { t } = useI18n()
  const router = useRouter()
  const [business, setBusiness] = useState<Business>(initialBusiness)
  const [projectsList, setProjectsList] = useState<Project[]>([])
  const [editModalOpen, setEditModalOpen] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    setBusiness(initialBusiness)
  }, [initialBusiness])

  const loadBusiness = useCallback(async () => {
    const updated = await getBusinessById(businessId)
    if (updated) setBusiness(updated)
  }, [businessId])

  const loadProjects = useCallback(async () => {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: true })
    if (data) setProjectsList(data as Project[])
  }, [supabase])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const social = getSocialLinks(business.social_links)
  const addressParts = [
    business.address_line1,
    business.address_line2,
    [business.city, business.state, business.postal_code].filter(Boolean).join(', '),
  ].filter(Boolean)
  const fullAddress = addressParts.join(', ')
  const mapsUrl = fullAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`
    : null

  const handleDelete = async () => {
    if (!confirm(`Delete "${business.name}"? This cannot be undone.`)) return
    const { error } = await deleteBusinessAction(business.id)
    if (error) {
      alert(error)
      return
    }
    router.push('/businesses')
  }

  return (
    <DetailLayout
      backHref="/businesses"
      backLabel={t('businesses.back_to_businesses')}
      title={business.name}
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditModalOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded-lg hover:bg-accent text-foreground text-sm font-medium"
          >
            <Edit className="w-4 h-4" />
            {t('common.edit')}
          </button>
          <button
            onClick={handleDelete}
            className="inline-flex items-center gap-2 px-3 py-2 border border-destructive/50 text-destructive rounded-lg hover:bg-destructive/10 text-sm font-medium"
          >
            {t('common.delete')}
          </button>
        </div>
      }
      contentClassName="p-4 sm:p-6"
    >
      <div className="flex flex-col gap-6">
        {business.tagline && (
          <p className="text-muted-foreground">{business.tagline}</p>
        )}
        {clientName && (
          <Link
            href={`/clients/${business.client_id}`}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <User className="w-4 h-4" />
            {clientName}
          </Link>
        )}
        {(business.email || business.website) && (
          <div className="flex flex-wrap gap-4 text-muted-foreground">
            {business.email && (
              <EmailAction email={business.email} />
            )}
            {business.website && (
              <a
                href={business.website.startsWith('http') ? business.website : `https://${business.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-primary hover:underline"
              >
                <Globe className="w-4 h-4" />
                {business.website}
              </a>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
            <section className="bg-card rounded-lg shadow-sm border border-border p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                {t('businesses.address')}
              </h2>
              {addressParts.length > 0 ? (
                mapsUrl ? (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {addressParts.join(' · ')}
                  </a>
                ) : (
                  <p className="text-gray-900 dark:text-white">{addressParts.join(' · ')}</p>
                )
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('businesses.no_address')}</p>
              )}
            </section>

            {Object.keys(social).length > 0 && (
              <section className="bg-card rounded-lg shadow-sm border border-border p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  {t('businesses.social')}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {SOCIAL_ICONS.filter((s) => social[s.key]).map((s) => (
                    <a
                      key={s.key}
                      href={social[s.key]!.startsWith('http') ? social[s.key]! : `https://${social[s.key]}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      {s.label}
                    </a>
                  ))}
                </div>
              </section>
            )}

            {business.notes && (
              <section className="bg-card rounded-lg shadow-sm border border-border p-6 lg:col-span-2">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <StickyNote className="w-5 h-5" />
                  Notes
                </h2>
                <p className="text-gray-900 dark:text-white whitespace-pre-wrap">{business.notes}</p>
              </section>
            )}
        </div>
      </div>

      <EditBusinessModal
        business={business}
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onUpdated={async () => {
          setEditModalOpen(false)
          await loadBusiness()
          router.refresh()
        }}
      />
    </DetailLayout>
  )
}

function EmailAction({ email }: { email: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white"
        >
          <Mail className="w-4 h-4" />
          {email}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => void navigator.clipboard.writeText(email)}>
          <Copy className="w-4 h-4 mr-2" />
          Copy email
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={`mailto:${email}`}>
            <Send className="w-4 h-4 mr-2" />
            Send email
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
