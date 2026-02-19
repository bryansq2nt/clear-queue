'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useI18n } from '@/components/I18nProvider';
import { Database } from '@/lib/supabase/types';
import {
  UserCircle,
  Building2,
  ExternalLink,
  Pencil,
  Copy,
  Check,
} from 'lucide-react';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import { ClientProfileModal } from './ClientProfileModal';
import { BusinessProfileModal } from './BusinessProfileModal';

type Project = Database['public']['Tables']['projects']['Row'];
type Client = Database['public']['Tables']['clients']['Row'];
type Business = Database['public']['Tables']['businesses']['Row'];

function CopyButton({
  text,
  label,
  className = '',
}: {
  text: string;
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center p-1.5 rounded-md text-primary hover:bg-primary/10 transition-colors ${className}`}
    >
      {copied ? (
        <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
      ) : (
        <Copy className="w-4 h-4" />
      )}
    </button>
  );
}

interface ContextOwnerClientProps {
  project: Project;
  client: Client | null;
  business: Business | null;
}

/**
 * Project owner tab: client + business for this project in one view.
 * Shows summary cards with link to full profile; empty state links to edit project.
 */
export default function ContextOwnerClient({
  project,
  client,
  business,
}: ContextOwnerClientProps) {
  const { t } = useI18n();
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [businessModalOpen, setBusinessModalOpen] = useState(false);
  const hasAny = !!client || !!business;

  return (
    <div className="p-4 md:p-6 max-w-2xl">
      <h2 className="text-lg font-semibold text-foreground mb-4">
        {t('context.project_owner')}
      </h2>

      {!hasAny ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <div className="flex justify-center gap-4 mb-4">
            <UserCircle className="w-12 h-12 text-muted-foreground" />
            <Building2 className="w-12 h-12 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground mb-4">
            {t('context.owner_empty_hint')}
          </p>
          <Link
            href={`/project/${project.id}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            <Pencil className="w-4 h-4" />
            {t('topbar.edit_project')}
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {client && (
            <section className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <UserCircle className="w-5 h-5 text-primary flex-shrink-0" />
                  <h3 className="font-semibold text-foreground truncate">
                    {client.full_name}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setClientModalOpen(true)}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <span className="hidden sm:inline">
                    {t('context.view_full_profile')}
                  </span>
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 space-y-2 text-sm">
                {client.email && (
                  <div className="flex items-center gap-2 text-muted-foreground group">
                    <span className="font-medium text-foreground w-16 shrink-0">
                      {t('clients.email_label')}:
                    </span>
                    <a
                      href={`mailto:${client.email}`}
                      className="text-primary hover:underline truncate min-w-0"
                    >
                      {client.email}
                    </a>
                    <CopyButton
                      text={client.email}
                      label={t('clients.copy_email')}
                      className="shrink-0"
                    />
                  </div>
                )}
                {client.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="font-medium text-foreground w-16 shrink-0">
                      {t('clients.phone')}:
                    </span>
                    <span className="truncate min-w-0">
                      {formatPhoneDisplay(client.phone)}
                    </span>
                    <CopyButton
                      text={client.phone}
                      label={t('common.copy')}
                      className="shrink-0"
                    />
                  </div>
                )}
                {client.address_line1 && (
                  <div className="flex items-start gap-2 text-muted-foreground">
                    <span className="font-medium text-foreground w-16 shrink-0 pt-0.5">
                      {t('clients.address')}:
                    </span>
                    <span className="min-w-0 flex-1">
                      {[
                        client.address_line1,
                        client.address_line2,
                        client.city,
                        client.state,
                        client.postal_code,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                    <CopyButton
                      text={[
                        client.address_line1,
                        client.address_line2,
                        client.city,
                        client.state,
                        client.postal_code,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                      label={t('common.copy')}
                      className="shrink-0 mt-0.5"
                    />
                  </div>
                )}
                {client.notes && (
                  <p className="text-muted-foreground pt-2 border-t border-border">
                    {client.notes.length > 200
                      ? `${client.notes.slice(0, 200)}…`
                      : client.notes}
                  </p>
                )}
              </div>
            </section>
          )}

          {business && (
            <section className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 className="w-5 h-5 text-primary flex-shrink-0" />
                  <h3 className="font-semibold text-foreground truncate">
                    {business.name}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setBusinessModalOpen(true)}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <span className="hidden sm:inline">
                    {t('context.view_full_profile')}
                  </span>
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 space-y-2 text-sm">
                {business.tagline && (
                  <p className="text-muted-foreground italic">
                    {business.tagline}
                  </p>
                )}
                {business.description && (
                  <p className="text-muted-foreground">
                    {business.description.length > 250
                      ? `${business.description.slice(0, 250)}…`
                      : business.description}
                  </p>
                )}
                {business.email && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="font-medium text-foreground w-16 shrink-0">
                      {t('clients.email_label')}:
                    </span>
                    <a
                      href={`mailto:${business.email}`}
                      className="text-primary hover:underline truncate min-w-0"
                    >
                      {business.email}
                    </a>
                    <CopyButton
                      text={business.email}
                      label={t('clients.copy_email')}
                      className="shrink-0"
                    />
                  </div>
                )}
                {business.website && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="font-medium text-foreground w-16 shrink-0">
                      {t('businesses.website_label')}:
                    </span>
                    <a
                      href={
                        business.website.startsWith('http')
                          ? business.website
                          : `https://${business.website}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline truncate min-w-0"
                    >
                      {business.website}
                    </a>
                    <CopyButton
                      text={
                        business.website.startsWith('http')
                          ? business.website
                          : `https://${business.website}`
                      }
                      label={t('common.copy')}
                      className="shrink-0"
                    />
                  </div>
                )}
                {business.address_line1 && (
                  <div className="flex items-start gap-2 text-muted-foreground">
                    <span className="font-medium text-foreground w-16 shrink-0 pt-0.5">
                      {t('clients.address')}:
                    </span>
                    <span className="min-w-0 flex-1">
                      {[
                        business.address_line1,
                        business.address_line2,
                        business.city,
                        business.state,
                        business.postal_code,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                    <CopyButton
                      text={[
                        business.address_line1,
                        business.address_line2,
                        business.city,
                        business.state,
                        business.postal_code,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                      label={t('common.copy')}
                      className="shrink-0 mt-0.5"
                    />
                  </div>
                )}
                {business.notes && (
                  <p className="text-muted-foreground pt-2 border-t border-border">
                    {business.notes.length > 200
                      ? `${business.notes.slice(0, 200)}…`
                      : business.notes}
                  </p>
                )}
              </div>
            </section>
          )}

          <p className="text-xs text-muted-foreground">
            {t('context.owner_edit_hint')}
          </p>

          {client && (
            <ClientProfileModal
              clientId={client.id}
              open={clientModalOpen}
              onClose={() => setClientModalOpen(false)}
            />
          )}
          {business && (
            <BusinessProfileModal
              businessId={business.id}
              open={businessModalOpen}
              onClose={() => setBusinessModalOpen(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}
