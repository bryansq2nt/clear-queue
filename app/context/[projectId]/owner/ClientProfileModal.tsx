'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContentWithoutClose,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/components/shared/I18nProvider';
import { Database } from '@/lib/supabase/types';
import {
  getClientById,
  getBusinessesByClientId,
  getClientLinks,
  getProjectsByClientId,
} from '@/app/actions/clients';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import {
  User,
  MapPin,
  Building2,
  FolderKanban,
  Link2,
  StickyNote,
  X,
} from 'lucide-react';

type Client = Database['public']['Tables']['clients']['Row'];
type Business = Database['public']['Tables']['businesses']['Row'];
type ClientLink = Database['public']['Tables']['client_links']['Row'];

interface ClientProfileModalProps {
  clientId: string;
  open: boolean;
  onClose: () => void;
}

const CONTEXT_TAB_CONTENT_ID = 'context-tab-content';

export function ClientProfileModal({
  clientId,
  open,
  onClose,
}: ClientProfileModalProps) {
  const { t } = useI18n();
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setContainer(document.getElementById(CONTEXT_TAB_CONTENT_ID));
  }, []);
  const [client, setClient] = useState<Client | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [links, setLinks] = useState<ClientLink[]>([]);
  const [projects, setProjects] = useState<
    { id: string; name: string; color: string | null }[]
  >([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const [c, b, l, p] = await Promise.all([
        getClientById(clientId),
        getBusinessesByClientId(clientId),
        getClientLinks(clientId),
        getProjectsByClientId(clientId),
      ]);
      setClient(c ?? null);
      setBusinesses(b ?? []);
      setLinks(l ?? []);
      setProjects(p ?? []);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    if (open && clientId) load();
  }, [open, clientId, load]);

  const addressParts = client
    ? [
        client.address_line1,
        client.address_line2,
        [client.city, client.state, client.postal_code]
          .filter(Boolean)
          .join(', '),
      ].filter(Boolean)
    : [];
  const fullAddress = addressParts.join(', ');
  const mapsUrl = fullAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`
    : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContentWithoutClose
        container={container ?? undefined}
        positionMode={container ? 'container' : 'viewport'}
        className="bg-background data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border bg-card px-4 py-3">
          <DialogTitle className="text-lg font-semibold text-foreground">
            {client ? client.full_name : t('clients.detail_title')}
          </DialogTitle>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label={t('common.close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 md:p-6">
          {loading ? (
            <p className="text-muted-foreground">{t('common.loading')}</p>
          ) : !client ? (
            <p className="text-muted-foreground">{t('common.error')}</p>
          ) : (
            <div className="mx-auto max-w-4xl space-y-6">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <section className="rounded-lg border border-border bg-card p-6">
                  <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                    <User className="h-5 w-5" />
                    {t('clients.contact')}
                  </h2>
                  <dl className="space-y-3 text-sm">
                    <div>
                      <dt className="text-muted-foreground">
                        {t('clients.full_name')}
                      </dt>
                      <dd className="font-medium text-foreground">
                        {client.full_name}
                      </dd>
                    </div>
                    {client.phone && (
                      <div>
                        <dt className="text-muted-foreground">
                          {t('clients.phone')}
                        </dt>
                        <dd>
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
                        <dt className="text-muted-foreground">
                          {t('clients.email_label')}
                        </dt>
                        <dd>
                          <a
                            href={`mailto:${client.email}`}
                            className="text-primary hover:underline"
                          >
                            {client.email}
                          </a>
                        </dd>
                      </div>
                    )}
                  </dl>
                </section>

                <section className="rounded-lg border border-border bg-card p-6">
                  <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                    <MapPin className="h-5 w-5" />
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
              </div>

              <section className="rounded-lg border border-border bg-card p-6">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                  <Building2 className="h-5 w-5" />
                  {t('clients.businesses')}
                </h2>
                {businesses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('clients.no_businesses_yet')}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {businesses.map((b) => (
                      <li key={b.id} className="text-foreground">
                        {b.name}
                        {b.tagline && (
                          <span className="ml-2 text-sm text-muted-foreground">
                            — {b.tagline}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-lg border border-border bg-card p-6">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                  <FolderKanban className="h-5 w-5" />
                  {t('clients.projects')}
                </h2>
                {projects.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('clients.no_projects_linked')}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {projects.map((p) => (
                      <li key={p.id} className="flex items-center gap-2">
                        {p.color && (
                          <span
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: p.color }}
                          />
                        )}
                        <span className="text-foreground">{p.name}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-lg border border-border bg-card p-6">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                  <Link2 className="h-5 w-5" />
                  {t('clients.links')}
                </h2>
                {links.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('clients.no_links_yet')}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {links.map((link) => (
                      <li key={link.id}>
                        <a
                          href={
                            link.url.startsWith('http')
                              ? link.url
                              : `https://${link.url}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {link.label || link.url}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-lg border border-border bg-card p-6">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                  <StickyNote className="h-5 w-5" />
                  {t('clients.notes_preferences')}
                </h2>
                {client.preferences && (
                  <div className="mb-4">
                    <h3 className="mb-1 text-sm font-medium text-muted-foreground">
                      {t('clients.preferences')}
                    </h3>
                    <p className="whitespace-pre-wrap text-foreground">
                      {client.preferences}
                    </p>
                  </div>
                )}
                {client.notes && (
                  <div>
                    <h3 className="mb-1 text-sm font-medium text-muted-foreground">
                      {t('clients.notes')}
                    </h3>
                    <p className="whitespace-pre-wrap text-foreground">
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
          )}
        </div>
      </DialogContentWithoutClose>
    </Dialog>
  );
}
