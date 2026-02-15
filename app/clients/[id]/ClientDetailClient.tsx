'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Database } from '@/lib/supabase/types';
import { DetailLayout } from '@/components/DetailLayout';
import { useI18n } from '@/components/I18nProvider';
import {
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
  User,
} from 'lucide-react';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import { getProjectsForSidebar } from '@/app/actions/projects';
import {
  getProjectsByClientId,
  getClientById,
  getBusinessesByClientId,
  getClientLinks,
  createClientLinkAction,
  updateClientLinkAction,
  deleteClientLinkAction,
} from '../actions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { EditClientModal } from '../components/EditClientModal';
import { BusinessCard } from '../components/BusinessCard';
import { CreateBusinessModal } from '../components/CreateBusinessModal';
import { EditBusinessModal } from '../components/EditBusinessModal';

type Project = Database['public']['Tables']['projects']['Row'];
type Client = Database['public']['Tables']['clients']['Row'];
type Business = Database['public']['Tables']['businesses']['Row'];
type ClientLink = Database['public']['Tables']['client_links']['Row'];

type ProjectSummary = {
  id: string;
  name: string;
  color: string | null;
  category: string;
};

function EmailAction({
  email,
  t,
}: {
  email: string;
  t: (key: string) => string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <Mail className="w-4 h-4" />
          {email}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem
          onClick={() => void navigator.clipboard.writeText(email)}
        >
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
  );
}

function LinkForm({
  clientId,
  initialUrl,
  initialLabel,
  onSaved,
  onCancel,
  editingId,
  t,
}: {
  clientId: string;
  initialUrl: string;
  initialLabel: string;
  onSaved: () => void;
  onCancel: () => void;
  editingId: string | null;
  t: (key: string) => string;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [label, setLabel] = useState(initialLabel);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const formData = new FormData();
    formData.set('url', url.trim());
    formData.set('label', label.trim());
    const result = editingId
      ? await updateClientLinkAction(editingId, formData)
      : await createClientLinkAction(clientId, formData);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-2.5 p-3 rounded-lg bg-muted/50 border border-border"
    >
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div>
        <Label
          htmlFor="link-url"
          className="text-sm font-medium text-foreground"
        >
          {t('clients.link_url_label')}
        </Label>
        <Input
          id="link-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t('clients.link_url_placeholder')}
          required
          className="h-8 text-sm border-input bg-background mt-0.5"
        />
      </div>
      <div>
        <Label
          htmlFor="link-label"
          className="text-sm font-medium text-foreground"
        >
          {t('clients.link_label_optional')}
        </Label>
        <Input
          id="link-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t('clients.link_label_placeholder')}
          className="h-8 text-sm border-input bg-background mt-0.5"
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={saving}
          size="sm"
          className="bg-primary text-primary-foreground hover:opacity-90"
        >
          {saving ? t('clients.saving') : t('common.save')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          className="border-border text-foreground hover:bg-accent"
        >
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

interface ClientDetailClientProps {
  clientId: string;
  initialClient: Client;
}

export default function ClientDetailClient({
  clientId,
  initialClient,
}: ClientDetailClientProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [client, setClient] = useState<Client>(initialClient);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [businessesLoading, setBusinessesLoading] = useState(true);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [isCreateBusinessOpen, setIsCreateBusinessOpen] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState<Business | null>(null);
  const [projectsList, setProjectsList] = useState<Project[]>([]);
  const [links, setLinks] = useState<ClientLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(true);
  const [showAddLink, setShowAddLink] = useState(false);
  const [editingLink, setEditingLink] = useState<ClientLink | null>(null);

  useEffect(() => {
    setClient(initialClient);
  }, [initialClient]);

  const loadProjects = useCallback(async () => {
    const data = await getProjectsByClientId(clientId);
    setProjects(data);
    setProjectsLoading(false);
  }, [clientId]);

  const loadBusinesses = useCallback(async () => {
    setBusinessesLoading(true);
    const data = await getBusinessesByClientId(clientId);
    setBusinesses(data);
    setBusinessesLoading(false);
  }, [clientId]);

  const loadLinks = useCallback(async () => {
    setLinksLoading(true);
    const data = await getClientLinks(clientId);
    setLinks(data);
    setLinksLoading(false);
  }, [clientId]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    loadBusinesses();
  }, [loadBusinesses]);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  const loadSidebarProjects = useCallback(async () => {
    const data = await getProjectsForSidebar();
    setProjectsList(data);
  }, []);

  useEffect(() => {
    loadSidebarProjects();
  }, [loadSidebarProjects]);

  const addressParts = [
    client.address_line1,
    client.address_line2,
    [client.city, client.state, client.postal_code].filter(Boolean).join(', '),
  ].filter(Boolean);
  const fullAddress = addressParts.join(', ');
  const mapsUrl = fullAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`
    : null;

  return (
    <DetailLayout
      backHref="/clients"
      backLabel=""
      title={t('clients.client_info_title')}
      contentClassName="p-4 sm:p-6"
    >
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          {/* Contact */}
          <section className="bg-card rounded-lg shadow-sm border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <User className="w-5 h-5" />
              {t('clients.contact')}
            </h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">
                  {t('clients.full_name')}
                </dt>
                <dd className="text-foreground font-medium">
                  {client.full_name}
                </dd>
              </div>
              {client.phone && (
                <div>
                  <dt className="text-muted-foreground">
                    {t('clients.phone')}
                  </dt>
                  <dd className="text-foreground">
                    <a
                      href={`tel:${client.phone.replace(/\s/g, '')}`}
                      className="text-primary hover:underline"
                    >
                      {formatPhoneDisplay(client.phone)}
                    </a>
                  </dd>
                </div>
              )}
              {client.email && (
                <div>
                  <dt className="text-muted-foreground">{t('auth.email')}</dt>
                  <dd className="text-foreground">
                    <EmailAction email={client.email} t={t} />
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {/* Details */}
          <section className="bg-card rounded-lg shadow-sm border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              {t('clients.details')}
            </h2>
            <dl className="space-y-3 text-sm">
              {client.gender && (
                <div>
                  <dt className="text-muted-foreground">
                    {t('clients.gender')}
                  </dt>
                  <dd className="text-foreground">
                    {client.gender === 'male'
                      ? t('clients.gender_male')
                      : client.gender === 'female'
                        ? t('clients.gender_female')
                        : t('clients.gender_not_specified')}
                  </dd>
                </div>
              )}
              {addressParts.length > 0 && (
                <div>
                  <dt className="text-muted-foreground">
                    {t('clients.address')}
                  </dt>
                  <dd className="text-foreground">
                    {mapsUrl ? (
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
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
                <p className="text-muted-foreground">
                  {t('clients.no_details')}
                </p>
              )}
            </dl>
          </section>

          {/* Businesses */}
          <section className="bg-card rounded-lg shadow-sm border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                {t('clients.businesses')}
              </h2>
              <button
                onClick={() => setIsCreateBusinessOpen(true)}
                className="text-sm px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90"
              >
                {t('clients.add_business')}
              </button>
            </div>
            {businessesLoading ? (
              <p className="text-sm text-muted-foreground">
                {t('common.loading')}
              </p>
            ) : businesses.length === 0 ? (
              <p className="text-sm text-muted-foreground">
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
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <FolderKanban className="w-5 h-5" />
              {t('clients.projects')}
            </h2>
            {projectsLoading ? (
              <p className="text-sm text-muted-foreground">
                {t('common.loading')}
              </p>
            ) : projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('clients.no_projects_linked')}
              </p>
            ) : (
              <ul className="space-y-2">
                {projects.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/project/${p.id}`}
                      className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
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
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
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
                  setShowAddLink(false);
                  setEditingLink(null);
                  await loadLinks();
                }}
                onCancel={() => {
                  setShowAddLink(false);
                  setEditingLink(null);
                }}
                editingId={editingLink?.id ?? null}
                t={t}
              />
            )}
            {linksLoading ? (
              <p className="text-sm text-muted-foreground">
                {t('common.loading')}
              </p>
            ) : links.length === 0 && !showAddLink && !editingLink ? (
              <p className="text-sm text-muted-foreground">
                {t('clients.no_links_yet')}
              </p>
            ) : (
              <ul className="space-y-2 mt-4">
                {links.map((link) => (
                  <li
                    key={link.id}
                    className="flex items-center justify-between gap-2 py-2 border-b border-border last:border-0"
                  >
                    <a
                      href={
                        link.url.startsWith('http')
                          ? link.url
                          : `https://${link.url}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline truncate flex-1 min-w-0"
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
                          if (!confirm(t('clients.remove_link_confirm')))
                            return;
                          await deleteClientLinkAction(link.id);
                          loadLinks();
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
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <StickyNote className="w-5 h-5" />
              {t('clients.notes_preferences')}
            </h2>
            {client.preferences && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-muted-foreground mb-1">
                  {t('clients.preferences')}
                </h3>
                <p className="text-foreground whitespace-pre-wrap">
                  {client.preferences}
                </p>
              </div>
            )}
            {client.notes && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">
                  {t('clients.notes')}
                </h3>
                <p className="text-foreground whitespace-pre-wrap">
                  {client.notes}
                </p>
              </div>
            )}
            {!client.preferences && !client.notes && (
              <p className="text-sm text-muted-foreground">
                {t('clients.no_notes_or_preferences')}
              </p>
            )}
          </section>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setEditModalOpen(true)}
        aria-label={t('clients.edit_client')}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background md:bottom-8 md:right-8"
      >
        <Edit className="h-6 w-6" />
      </button>

      <EditClientModal
        client={client}
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onUpdated={async () => {
          setEditModalOpen(false);
          const updated = await getClientById(clientId);
          if (updated) setClient(updated);
          router.refresh();
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
          loadBusinesses();
          setEditingBusiness(null);
        }}
      />
    </DetailLayout>
  );
}
