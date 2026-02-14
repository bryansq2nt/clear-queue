'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/I18nProvider'
import { DetailLayout } from '@/components/DetailLayout'
import {
  getBusinessById,
  getProjectsByBusinessId,
  getClients,
  updateBusinessFieldsAction,
} from '@/app/clients/actions'
import {
  listProjectsWithBusinessIdAction,
  linkProjectToBusinessAction,
} from '@/app/businesses/actions'
import { EditBusinessModal } from '@/app/clients/components/EditBusinessModal'
import {
  User,
  Mail,
  Globe,
  MapPin,
  StickyNote,
  Edit,
  Copy,
  Send,
  FolderKanban,
  Plus,
  Check,
  X,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import type { SocialLinks } from '@/app/clients/actions'
import type { Database } from '@/lib/supabase/types'

type Business = Database['public']['Tables']['businesses']['Row']
type Client = Database['public']['Tables']['clients']['Row']

type ProjectSummary = { id: string; name: string; color: string | null; category: string }

const SOCIAL_KEYS = ['instagram', 'facebook', 'tiktok', 'youtube'] as const
const SOCIAL_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
}

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
  const [relatedProjects, setRelatedProjects] = useState<ProjectSummary[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [linkProjectOpen, setLinkProjectOpen] = useState(false)
  const [projectsForLink, setProjectsForLink] = useState<{ id: string; name: string; business_id: string | null }[]>([])
  const [linkProjectId, setLinkProjectId] = useState('')
  const [linkProjectSaving, setLinkProjectSaving] = useState(false)
  const [addSocialOpen, setAddSocialOpen] = useState(false)
  const [newSocialKey, setNewSocialKey] = useState<string>('instagram')
  const [newSocialUrl, setNewSocialUrl] = useState('')
  const [editModalOpen, setEditModalOpen] = useState(false)

  useEffect(() => {
    setBusiness(initialBusiness)
  }, [initialBusiness])

  const loadBusiness = useCallback(async () => {
    const updated = await getBusinessById(businessId)
    if (updated) setBusiness(updated)
  }, [businessId])

  const loadRelatedData = useCallback(async () => {
    setProjectsLoading(true)
    const projects = await getProjectsByBusinessId(businessId)
    setRelatedProjects(projects)
    setProjectsLoading(false)
  }, [businessId])

  useEffect(() => {
    loadRelatedData()
  }, [loadRelatedData])

  useEffect(() => {
    if (linkProjectOpen) listProjectsWithBusinessIdAction().then(setProjectsForLink)
  }, [linkProjectOpen])
  useEffect(() => {
    if (editModalOpen) getClients().then(setClients)
  }, [editModalOpen])

  const saveField = useCallback(
    async (field: string, value: string) => {
      setSaving(true)
      const trimmed = value.trim()
      const payload: Record<string, string | null> = {}
      if (field === 'name') payload.name = trimmed || business.name
      else if (field === 'tagline') payload.tagline = trimmed || null
      else if (field === 'description') payload.description = trimmed || null
      else if (field === 'website') payload.website = trimmed || null
      else if (field === 'email') payload.email = trimmed || null
      else if (field === 'address_line1') payload.address_line1 = trimmed || null
      else if (field === 'address_line2') payload.address_line2 = trimmed || null
      else if (field === 'city') payload.city = trimmed || null
      else if (field === 'state') payload.state = trimmed || null
      else if (field === 'postal_code') payload.postal_code = trimmed || null
      else if (field === 'notes') payload.notes = trimmed || null
      else if (field === 'client_id') payload.client_id = trimmed || business.client_id
      const result = await updateBusinessFieldsAction(businessId, payload)
      setSaving(false)
      setEditingField(null)
      if (result.data) setBusiness(result.data)
      if (result.error) alert(result.error)
      if (field === 'client_id') router.refresh()
    },
    [businessId, business.name, business.client_id, router]
  )

  const startEdit = (field: string, current: string | null) => {
    setEditingField(field)
    setEditingValue(current ?? '')
  }

  const social = getSocialLinks(business.social_links)
  const addressParts = [
    business.address_line1,
    business.address_line2,
    [business.city, business.state, business.postal_code].filter(Boolean).join(', '),
  ].filter(Boolean)
  const mapsUrl =
    addressParts.length > 0
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressParts.join(', '))}`
      : null

  const handleAddSocial = async () => {
    const url = newSocialUrl.trim()
    if (!url) return
    const next = { ...social, [newSocialKey]: url }
    const result = await updateBusinessFieldsAction(businessId, { social_links: next })
    if (result.data) {
      setBusiness(result.data)
      setNewSocialUrl('')
      setAddSocialOpen(false)
    }
    if (result.error) alert(result.error)
  }

  const handleLinkProject = async () => {
    if (!linkProjectId) return
    setLinkProjectSaving(true)
    const result = await linkProjectToBusinessAction(linkProjectId, businessId)
    setLinkProjectSaving(false)
    if (result.error) alert(result.error)
    else {
      setLinkProjectOpen(false)
      setLinkProjectId('')
      loadRelatedData()
      router.refresh()
    }
  }

  return (
    <DetailLayout
      backHref="/businesses"
      backLabel=""
      title={t('businesses.business_info')}
      contentClassName="p-4 sm:p-6"
    >
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          {/* 1. Details card */}
          <section className="bg-card rounded-lg shadow-sm border border-border p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              {t('businesses.details')}
            </h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <DetailRow
                label={t('businesses.name_label')}
                value={business.name}
                editing={editingField === 'name'}
                editValue={editingValue}
                onEditChange={setEditingValue}
                onSave={() => saveField('name', editingValue)}
                onCancel={() => setEditingField(null)}
                onStartEdit={() => startEdit('name', business.name)}
                saving={saving}
              />
              <DetailRow
                label={t('businesses.tagline_label')}
                value={business.tagline ?? ''}
                editing={editingField === 'tagline'}
                editValue={editingValue}
                onEditChange={setEditingValue}
                onSave={() => saveField('tagline', editingValue)}
                onCancel={() => setEditingField(null)}
                onStartEdit={() => startEdit('tagline', business.tagline ?? '')}
                saving={saving}
              />
              <div className="sm:col-span-2">
                <Label className="text-muted-foreground text-xs">{t('businesses.description_label')}</Label>
                {editingField === 'description' ? (
                  <div className="mt-1 flex gap-2">
                    <Textarea
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      className="min-h-[80px] text-sm border-input bg-background"
                      placeholder={t('businesses.optional_placeholder')}
                    />
                    <div className="flex flex-col gap-1">
                      <Button size="icon" variant="ghost" onClick={() => saveField('description', editingValue)} disabled={saving}>
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setEditingField(null)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p
                    className="mt-1 text-foreground cursor-pointer hover:bg-accent/50 rounded p-2 -m-2 flex items-center gap-2"
                    onClick={() => startEdit('description', business.description ?? '')}
                  >
                    {business.description || (
                      <span className="text-muted-foreground italic">{t('businesses.optional_placeholder')}</span>
                    )}
                    <Edit className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  </p>
                )}
              </div>
              <DetailRow
                label={t('businesses.website_label')}
                value={business.website ?? ''}
                editing={editingField === 'website'}
                editValue={editingValue}
                onEditChange={setEditingValue}
                onSave={() => saveField('website', editingValue)}
                onCancel={() => setEditingField(null)}
                onStartEdit={() => startEdit('website', business.website ?? '')}
                saving={saving}
              />
              <div>
                <Label className="text-muted-foreground text-xs">{t('businesses.client_label')}</Label>
                {editingField === 'client_id' ? (
                  <div className="mt-1 flex gap-2 items-center">
                    <Select
                      value={editingValue || 'none'}
                      onValueChange={(v) => setEditingValue(v === 'none' ? '' : v)}
                    >
                      <SelectTrigger className="h-8 text-sm border-input bg-background">
                        <SelectValue placeholder={t('businesses.select_client')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {clients.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="icon" variant="ghost" onClick={() => saveField('client_id', editingValue)} disabled={saving}>
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setEditingField(null)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <p
                    className="mt-1 text-foreground cursor-pointer hover:bg-accent/50 rounded p-2 -m-2 flex items-center gap-2"
                    onClick={() => {
                      setEditingField('client_id')
                      setEditingValue(business.client_id)
                      if (clients.length === 0) getClients().then(setClients)
                    }}
                  >
                    {clientName ? (
                      <Link href={`/clients/${business.client_id}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                        {clientName}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    <Edit className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  </p>
                )}
              </div>
            </dl>
          </section>

          {/* 2. Contact info card */}
          <section className="bg-card rounded-lg shadow-sm border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Mail className="w-5 h-5" />
              {t('businesses.contact_info')}
            </h2>
            <dl className="space-y-3 text-sm">
              <DetailRow
                label={t('auth.email')}
                value={business.email ?? ''}
                editing={editingField === 'email'}
                editValue={editingValue}
                onEditChange={setEditingValue}
                onSave={() => saveField('email', editingValue)}
                onCancel={() => setEditingField(null)}
                onStartEdit={() => startEdit('email', business.email ?? '')}
                saving={saving}
              />
              <DetailRow
                label={t('businesses.address_line1_label')}
                value={business.address_line1 ?? ''}
                editing={editingField === 'address_line1'}
                editValue={editingValue}
                onEditChange={setEditingValue}
                onSave={() => saveField('address_line1', editingValue)}
                onCancel={() => setEditingField(null)}
                onStartEdit={() => startEdit('address_line1', business.address_line1 ?? '')}
                saving={saving}
              />
              <DetailRow
                label={t('businesses.address_line2_label')}
                value={business.address_line2 ?? ''}
                editing={editingField === 'address_line2'}
                editValue={editingValue}
                onEditChange={setEditingValue}
                onSave={() => saveField('address_line2', editingValue)}
                onCancel={() => setEditingField(null)}
                onStartEdit={() => startEdit('address_line2', business.address_line2 ?? '')}
                saving={saving}
              />
              <div className="grid grid-cols-3 gap-2">
                <DetailRow
                  label={t('businesses.city_label')}
                  value={business.city ?? ''}
                  editing={editingField === 'city'}
                  editValue={editingValue}
                  onEditChange={setEditingValue}
                  onSave={() => saveField('city', editingValue)}
                  onCancel={() => setEditingField(null)}
                  onStartEdit={() => startEdit('city', business.city ?? '')}
                  saving={saving}
                />
                <DetailRow
                  label={t('businesses.state_label')}
                  value={business.state ?? ''}
                  editing={editingField === 'state'}
                  editValue={editingValue}
                  onEditChange={setEditingValue}
                  onSave={() => saveField('state', editingValue)}
                  onCancel={() => setEditingField(null)}
                  onStartEdit={() => startEdit('state', business.state ?? '')}
                  saving={saving}
                />
                <DetailRow
                  label={t('businesses.postal_code_label')}
                  value={business.postal_code ?? ''}
                  editing={editingField === 'postal_code'}
                  editValue={editingValue}
                  onEditChange={setEditingValue}
                  onSave={() => saveField('postal_code', editingValue)}
                  onCancel={() => setEditingField(null)}
                  onStartEdit={() => startEdit('postal_code', business.postal_code ?? '')}
                  saving={saving}
                />
              </div>
            </dl>
          </section>

          {/* 3. Social card */}
          <section className="bg-card rounded-lg shadow-sm border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Globe className="w-5 h-5" />
                {t('businesses.social')}
              </h2>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setAddSocialOpen(true)}
              >
                <Plus className="w-4 h-4" />
                {t('businesses.add_social')}
              </Button>
            </div>
            {Object.keys(social).length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {SOCIAL_KEYS.filter((k) => social[k]).map((k) => (
                  <a
                    key={k}
                    href={
                      social[k]!.startsWith('http') ? social[k]! : `https://${social[k]}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm px-3 py-1.5 rounded-lg bg-muted text-foreground hover:bg-accent"
                  >
                    {SOCIAL_LABELS[k]}
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
            {addSocialOpen && (
              <div className="mt-4 p-3 rounded-lg bg-muted/50 border border-border space-y-2">
                <Select value={newSocialKey} onValueChange={setNewSocialKey}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOCIAL_KEYS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {SOCIAL_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="https://..."
                  value={newSocialUrl}
                  onChange={(e) => setNewSocialUrl(e.target.value)}
                  className="h-8 text-sm"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAddSocial} disabled={!newSocialUrl.trim()}>
                    {t('common.save')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setAddSocialOpen(false); setNewSocialUrl('') }}>
                    {t('common.cancel')}
                  </Button>
                </div>
              </div>
            )}
          </section>

          {/* 4. Related projects */}
          <section className="bg-card rounded-lg shadow-sm border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <FolderKanban className="w-5 h-5" />
                {t('businesses.related_projects')}
              </h2>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setLinkProjectOpen(true)}
              >
                <Plus className="w-4 h-4" />
                {t('businesses.link_project')}
              </Button>
            </div>
            {projectsLoading ? (
              <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
            ) : relatedProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('businesses.no_related_projects')}</p>
            ) : (
              <ul className="space-y-2">
                {relatedProjects.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/project/${p.id}`}
                      className="text-primary hover:underline font-medium"
                    >
                      {p.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 5. Notes (business notes integradas) */}
          <section className="bg-card rounded-lg shadow-sm border border-border p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <StickyNote className="w-5 h-5" />
              {t('businesses.notes_section')}
            </h2>
            {editingField === 'notes' ? (
              <div className="flex gap-2">
                <Textarea
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  className="min-h-[100px] text-sm border-input bg-background"
                  placeholder={t('businesses.optional_placeholder')}
                />
                <div className="flex flex-col gap-1">
                  <Button size="icon" variant="ghost" onClick={() => saveField('notes', editingValue)} disabled={saving}>
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setEditingField(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <p
                className="text-foreground whitespace-pre-wrap text-sm cursor-pointer hover:bg-accent/50 rounded p-2 -m-2 min-h-[60px]"
                onClick={() => startEdit('notes', business.notes ?? '')}
              >
                {business.notes || (
                  <span className="text-muted-foreground italic">{t('businesses.optional_placeholder')}</span>
                )}
              </p>
            )}
          </section>
        </div>
      </div>

      <Dialog open={linkProjectOpen} onOpenChange={setLinkProjectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('businesses.link_project')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('businesses.select_project')}</Label>
              <Select value={linkProjectId} onValueChange={setLinkProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('businesses.select_project')} />
                </SelectTrigger>
                <SelectContent>
                  {projectsForLink
                    .filter((p) => p.business_id !== businessId)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkProjectOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleLinkProject} disabled={!linkProjectId || linkProjectSaving}>
              {linkProjectSaving ? t('common.loading') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <button
        type="button"
        onClick={() => setEditModalOpen(true)}
        aria-label={t('common.edit')}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background md:bottom-8 md:right-8"
      >
        <Edit className="h-6 w-6" />
      </button>
      <EditBusinessModal
        business={business}
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onUpdated={async () => {
          setEditModalOpen(false)
          await loadBusiness()
          await loadRelatedData()
          router.refresh()
        }}
      />
    </DetailLayout>
  )
}

function DetailRow({
  label,
  value,
  editing,
  editValue,
  onEditChange,
  onSave,
  onCancel,
  onStartEdit,
  saving,
}: {
  label: string
  value: string
  editing: boolean
  editValue: string
  onEditChange: (v: string) => void
  onSave: () => void
  onCancel: () => void
  onStartEdit: () => void
  saving: boolean
}) {
  return (
    <div>
      <Label className="text-muted-foreground text-xs">{label}</Label>
      {editing ? (
        <div className="mt-1 flex gap-2 items-center">
          <Input
            value={editValue}
            onChange={(e) => onEditChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSave()}
            className="h-8 text-sm border-input bg-background"
          />
          <Button size="icon" variant="ghost" onClick={onSave} disabled={saving}>
            <Check className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onCancel}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <p
          className="mt-1 text-foreground cursor-pointer hover:bg-accent/50 rounded p-2 -m-2 flex items-center gap-2"
          onClick={onStartEdit}
        >
          {value || <span className="text-muted-foreground italic">—</span>}
          <Edit className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        </p>
      )}
    </div>
  )
}

function EmailAction({
  email,
  t,
}: {
  email: string
  t: (key: string) => string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 text-foreground hover:underline"
        >
          <Mail className="w-4 h-4" />
          {email}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => void navigator.clipboard.writeText(email)}>
          <Copy className="w-4 h-4 mr-2" />
          {t('clients.copy_email')}
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={`mailto:${email}`}>
            <Send className="w-4 h-4 mr-2" />
            {t('clients.send_email')}
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
