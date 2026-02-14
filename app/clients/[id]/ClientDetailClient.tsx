'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/types'
import { DetailLayout } from '@/components/DetailLayout'
import { useI18n } from '@/components/I18nProvider'
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Building2,
  FolderKanban,
  StickyNote,
  Edit,
  Copy,
  Send,
  Link2,
  Plus,
} from 'lucide-react'
import {
  getProjectsByClientId,
  getClientById,
  getBusinessesByClientId,
  getClientLinks,
  createClientLinkAction,
  updateClientLinkAction,
  deleteClientLinkAction,
} from '../actions'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { EditClientModal } from '../components/EditClientModal'
import { BusinessCard } from '../components/BusinessCard'
import { CreateBusinessModal } from '../components/CreateBusinessModal'
import { EditBusinessModal } from '../components/EditBusinessModal'

type Project = Database['public']['Tables']['projects']['Row']
type Client = Database['public']['Tables']['clients']['Row']
type Business = Database['public']['Tables']['businesses']['Row']
type ClientLink = Database['public']['Tables']['client_links']['Row']

type ProjectSummary = { id: string; name: string; color: string | null; category: string }

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

function LinkForm({
  clientId,
  initialUrl,
  initialLabel,
  onSaved,
  onCancel,
  editingId,
}: {
  clientId: string
  initialUrl: string
  initialLabel: string
  onSaved: () => void
  onCancel: () => void
  editingId: string | null
}) {
  const [url, setUrl] = useState(initialUrl)
  const [label, setLabel] = useState(initialLabel)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    const formData = new FormData()
    formData.set('url', url.trim())
    formData.set('label', label.trim())
    const result = editingId
      ? await updateClientLinkAction(editingId, formData)
      : await createClientLinkAction(clientId, formData)
    setSaving(false)
    if (result.error) {
      setError(result.error)
      return
    }
    onSaved()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div>
        <Label htmlFor="link-url">URL *</Label>
        <Input
          id="link-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          required
        />
      </div>
      <div>
        <Label htmlFor="link-label">Label (optional)</Label>
        <Input
          id="link-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Reference doc"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

interface ClientDetailClientProps {
  clientId: string
  initialClient: Client
}

export default function ClientDetailClient({ clientId, initialClient }: ClientDetailClientProps) {
  const { t } = useI18n()
  const router = useRouter()
  const [client, setClient] = useState<Client>(initialClient)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [businessesLoading, setBusinessesLoading] = useState(true)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [isCreateBusinessOpen, setIsCreateBusinessOpen] = useState(false)
  const [editingBusiness, setEditingBusiness] = useState<Business | null>(null)
  const [projectsList, setProjectsList] = useState<Project[]>([])
  const [links, setLinks] = useState<ClientLink[]>([])
  const [linksLoading, setLinksLoading] = useState(true)
  const [showAddLink, setShowAddLink] = useState(false)
  const [editingLink, setEditingLink] = useState<ClientLink | null>(null)
  const supabase = createClient()

  useEffect(() => {
    setClient(initialClient)
  }, [initialClient])

  const loadProjects = useCallback(async () => {
    const data = await getProjectsByClientId(clientId)
    setProjects(data)
    setProjectsLoading(false)
  }, [clientId])

  const loadBusinesses = useCallback(async () => {
    setBusinessesLoading(true)
    const data = await getBusinessesByClientId(clientId)
    setBusinesses(data)
    setBusinessesLoading(false)
  }, [clientId])

  const loadLinks = useCallback(async () => {
    setLinksLoading(true)
    const data = await getClientLinks(clientId)
    setLinks(data)
    setLinksLoading(false)
  }, [clientId])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  useEffect(() => {
    loadBusinesses()
  }, [loadBusinesses])

  useEffect(() => {
    loadLinks()
  }, [loadLinks])

  const loadSidebarProjects = useCallback(async () => {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: true })
    if (data) setProjectsList(data as Project[])
  }, [supabase])

  useEffect(() => {
    loadSidebarProjects()
  }, [loadSidebarProjects])

  const addressParts = [
    client.address_line1,
    client.address_line2,
    [client.city, client.state, client.postal_code].filter(Boolean).join(', '),
  ].filter(Boolean)
  const fullAddress = addressParts.join(', ')
  const mapsUrl = fullAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`
    : null

  return (
    <DetailLayout
      backHref="/clients"
      backLabel={t('clients.back_to_clients')}
      title={client.full_name}
      actions={
        <button
          onClick={() => setEditModalOpen(true)}
          className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded-lg hover:bg-accent text-foreground text-sm font-medium"
        >
          <Edit className="w-4 h-4" />
          {t('common.edit')}
        </button>
      }
      contentClassName="p-4 sm:p-6"
    >
      <div className="flex flex-col gap-6">
        {(client.phone || client.email) && (
          <div className="flex flex-wrap gap-4 text-muted-foreground">
            {client.phone && (
              <a
                href={`tel:${client.phone.replace(/\s/g, '')}`}
                className="flex items-center gap-1.5 hover:text-foreground"
              >
                <Phone className="w-4 h-4" />
                {client.phone}
              </a>
            )}
            {client.email && (
              <EmailAction email={client.email} />
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
            {/* Details */}
            <section className="bg-card rounded-lg shadow-sm border border-border p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                {t('clients.details')}
              </h2>
              <dl className="space-y-3 text-sm">
                {client.gender && (
                  <div>
                    <dt className="text-gray-500 dark:text-gray-400">{t('clients.gender')}</dt>
                    <dd className="text-gray-900 dark:text-white">
                      {client.gender === 'male' ? t('clients.gender_male') : client.gender === 'female' ? t('clients.gender_female') : t('clients.gender_not_specified')}
                    </dd>
                  </div>
                )}
                {addressParts.length > 0 && (
                  <div>
                    <dt className="text-gray-500 dark:text-gray-400">{t('clients.address')}</dt>
                    <dd className="text-gray-900 dark:text-white">
                      {mapsUrl ? (
                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {addressParts.join(' · ')}
                        </a>
                      ) : (
                        addressParts.join(' · ')
                      )}
                    </dd>
                  </div>
                )}
                {!client.gender && addressParts.length === 0 && (
                  <p className="text-gray-500 dark:text-gray-400">{t('clients.no_details')}</p>
                )}
              </dl>
            </section>

            {/* Businesses */}
            <section className="bg-card rounded-lg shadow-sm border border-border p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  {t('clients.businesses')}
                </h2>
                <button
                  onClick={() => setIsCreateBusinessOpen(true)}
                  className="text-sm px-3 py-1.5 bg-slate-600 text-white rounded-lg hover:bg-slate-700"
                >
                  {t('clients.add_business')}
                </button>
              </div>
              {businessesLoading ? (
                <p className="text-sm text-gray-500">{t('common.loading')}</p>
              ) : businesses.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('clients.no_businesses_yet')}
                </p>
              ) : (
                <div className="space-y-3">
                  {businesses.map((b) => (
                    <BusinessCard
                      key={b.id}
                      business={b}
                      onDeleted={loadBusinesses}
                      onEdit={setEditingBusiness}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Projects */}
            <section className="bg-card rounded-lg shadow-sm border border-border p-6 lg:col-span-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <FolderKanban className="w-5 h-5" />
                {t('clients.projects')}
              </h2>
              {projectsLoading ? (
                <p className="text-sm text-gray-500">{t('common.loading')}</p>
              ) : projects.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('clients.no_projects_linked')}
                </p>
              ) : (
                <ul className="space-y-2">
                  {projects.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/project/${p.id}`}
                        className="flex items-center gap-2 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                      >
                        {p.color && (
                          <span
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: p.color }}
                          />
                        )}
                        {p.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Links */}
            <section className="bg-card rounded-lg shadow-sm border border-border p-6 lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Link2 className="w-5 h-5" />
                  {t('clients.links')}
                </h2>
                {!showAddLink && !editingLink && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAddLink(true)}
                  >
                    {t('clients.add_link')}
                  </Button>
                )}
              </div>
              {(showAddLink || editingLink) && (
                <LinkForm
                  clientId={clientId}
                  initialUrl={editingLink?.url ?? ''}
                  initialLabel={editingLink?.label ?? ''}
                  onSaved={async () => {
                    setShowAddLink(false)
                    setEditingLink(null)
                    await loadLinks()
                  }}
                  onCancel={() => {
                    setShowAddLink(false)
                    setEditingLink(null)
                  }}
                  editingId={editingLink?.id ?? null}
                />
              )}
              {linksLoading ? (
                <p className="text-sm text-gray-500">{t('common.loading')}</p>
              ) : links.length === 0 && !showAddLink && !editingLink ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('clients.no_links_yet')}
                </p>
              ) : (
                <ul className="space-y-2 mt-4">
                  {links.map((link) => (
                    <li
                      key={link.id}
                      className="flex items-center justify-between gap-2 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"
                    >
                      <a
                        href={link.url.startsWith('http') ? link.url : `https://${link.url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline truncate flex-1 min-w-0"
                      >
                        {link.label || link.url}
                      </a>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingLink(link)}
                        >
                          {t('common.edit')}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={async () => {
                            if (!confirm('Remove this link?')) return
                            await deleteClientLinkAction(link.id)
                            loadLinks()
                          }}
                        >
                          {t('common.delete')}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Notes / Preferences */}
            <section className="bg-card rounded-lg shadow-sm border border-border p-6 lg:col-span-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <StickyNote className="w-5 h-5" />
                {t('clients.notes_preferences')}
              </h2>
              {client.preferences && (
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                    {t('clients.preferences')}
                  </h3>
                  <p className="text-gray-900 dark:text-white whitespace-pre-wrap">
                    {client.preferences}
                  </p>
                </div>
              )}
              {client.notes && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                    {t('clients.notes')}
                  </h3>
                  <p className="text-gray-900 dark:text-white whitespace-pre-wrap">{client.notes}</p>
                </div>
              )}
              {!client.preferences && !client.notes && (
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('clients.no_notes_or_preferences')}</p>
              )}
            </section>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setIsCreateBusinessOpen(true)}
        aria-label={t('businesses.add_business')}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background md:bottom-8 md:right-8"
      >
        <Plus className="h-6 w-6" />
      </button>

      <EditClientModal
        client={client}
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onUpdated={async () => {
          setEditModalOpen(false)
          const updated = await getClientById(clientId)
          if (updated) setClient(updated)
          router.refresh()
        }}
      />
      <CreateBusinessModal
        clientId={clientId}
        isOpen={isCreateBusinessOpen}
        onClose={() => setIsCreateBusinessOpen(false)}
        onCreated={loadBusinesses}
      />
      <EditBusinessModal
        business={editingBusiness}
        isOpen={!!editingBusiness}
        onClose={() => setEditingBusiness(null)}
        onUpdated={() => {
          loadBusinesses()
          setEditingBusiness(null)
        }}
      />
    </DetailLayout>
  )
}
