'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContentWithoutClose,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/components/I18nProvider';
import { Database } from '@/lib/supabase/types';
import { getBusinessById, getClientById } from '@/app/clients/actions';
import type { SocialLinks } from '@/app/clients/actions';
import {
  Building2,
  User,
  Mail,
  Globe,
  MapPin,
  StickyNote,
  X,
} from 'lucide-react';

type Business = Database['public']['Tables']['businesses']['Row'];

const SOCIAL_KEYS = ['instagram', 'facebook', 'tiktok', 'youtube'] as const;
const SOCIAL_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
};

function getSocialLinks(links: unknown): SocialLinks {
  if (links && typeof links === 'object' && !Array.isArray(links))
    return links as SocialLinks;
  return {};
}

interface BusinessProfileModalProps {
  businessId: string;
  open: boolean;
  onClose: () => void;
}

const CONTEXT_TAB_CONTENT_ID = 'context-tab-content';

export function BusinessProfileModal({
  businessId,
  open,
  onClose,
}: BusinessProfileModalProps) {
  const { t } = useI18n();
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setContainer(document.getElementById(CONTEXT_TAB_CONTENT_ID));
  }, []);
  const [business, setBusiness] = useState<Business | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const b = await getBusinessById(businessId);
      setBusiness(b ?? null);
      if (b?.client_id) {
        const c = await getClientById(b.client_id);
        setClientName(c?.full_name ?? null);
      } else {
        setClientName(null);
      }
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    if (open && businessId) load();
  }, [open, businessId, load]);

  const social = business ? getSocialLinks(business.social_links) : {};
  const addressParts = business
    ? [
        business.address_line1,
        business.address_line2,
        [business.city, business.state, business.postal_code].filter(Boolean).join(', '),
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
            {business ? business.name : t('businesses.details')}
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
          ) : !business ? (
            <p className="text-muted-foreground">{t('common.error')}</p>
          ) : (
            <div className="mx-auto max-w-4xl space-y-6">
              <section className="rounded-lg border border-border bg-card p-6">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                  <Building2 className="h-5 w-5" />
                  {t('businesses.details')}
                </h2>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">{t('businesses.name_label')}</dt>
                    <dd className="font-medium text-foreground">{business.name}</dd>
                  </div>
                  {business.tagline && (
                    <div>
                      <dt className="text-muted-foreground">{t('businesses.tagline_label')}</dt>
                      <dd className="text-foreground italic">{business.tagline}</dd>
                    </div>
                  )}
                  {business.description && (
                    <div>
                      <dt className="text-muted-foreground">{t('businesses.description_label')}</dt>
                      <dd className="whitespace-pre-wrap text-foreground">{business.description}</dd>
                    </div>
                  )}
                </dl>
              </section>

              <section className="rounded-lg border border-border bg-card p-6">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                  <Mail className="h-5 w-5" />
                  {t('businesses.contact_info')}
                </h2>
                <dl className="space-y-3 text-sm">
                  {business.email && (
                    <div>
                      <dt className="text-muted-foreground">{t('clients.email_label')}</dt>
                      <dd>
                        <a href={`mailto:${business.email}`} className="text-primary hover:underline">
                          {business.email}
                        </a>
                      </dd>
                    </div>
                  )}
                  {business.website && (
                    <div>
                      <dt className="text-muted-foreground">{t('businesses.website_label')}</dt>
                      <dd>
                        <a
                          href={business.website.startsWith('http') ? business.website : `https://${business.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {business.website}
                        </a>
                      </dd>
                    </div>
                  )}
                  {addressParts.length > 0 && (
                    <div>
                      <dt className="text-muted-foreground">{t('businesses.address')}</dt>
                      <dd className="text-foreground">
                        {mapsUrl ? (
                          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                            {addressParts.join(' · ')}
                          </a>
                        ) : (
                          addressParts.join(' · ')
                        )}
                      </dd>
                    </div>
                  )}
                  {!business.email && !business.website && addressParts.length === 0 && (
                    <p className="text-muted-foreground">{t('businesses.no_address')}</p>
                  )}
                </dl>
              </section>

              {clientName && (
                <section className="rounded-lg border border-border bg-card p-6">
                  <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-foreground">
                    <User className="h-5 w-5" />
                    {t('businesses.client_label')}
                  </h2>
                  <p className="text-foreground">{clientName}</p>
                </section>
              )}

              {SOCIAL_KEYS.some((k) => social[k]) && (
                <section className="rounded-lg border border-border bg-card p-6">
                  <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                    <Globe className="h-5 w-5" />
                    {t('businesses.social_links_label')}
                  </h2>
                  <ul className="space-y-2">
                    {SOCIAL_KEYS.filter((k) => social[k]).map((k) => (
                      <li key={k}>
                        <a
                          href={social[k]!.startsWith('http') ? social[k]! : `https://${social[k]}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {SOCIAL_LABELS[k] || k}: {social[k]}
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="rounded-lg border border-border bg-card p-6">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                  <StickyNote className="h-5 w-5" />
                  {t('businesses.notes_section')}
                </h2>
                {business.notes ? (
                  <p className="whitespace-pre-wrap text-foreground">{business.notes}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('right_panel.no_notes')}</p>
                )}
              </section>
            </div>
          )}
        </div>
      </DialogContentWithoutClose>
    </Dialog>
  );
}
