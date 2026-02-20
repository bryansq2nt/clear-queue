'use client';

import { useState, useCallback, useEffect } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { Database } from '@/lib/supabase/types';
import {
  UserCircle,
  Building2,
  ExternalLink,
  Copy,
  Check,
  Plus,
  Pencil,
  X,
} from 'lucide-react';
import { updateProject, linkBusinessToProject } from '@/app/actions/projects';
import { getClients, getBusinessesByClientId } from '@/app/clients/actions';
import { CreateClientModal } from '@/app/clients/components/CreateClientModal';
import { CreateBusinessModal } from '@/app/clients/components/CreateBusinessModal';
import { EditClientModal } from '@/app/clients/components/EditClientModal';
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
  /** Called after linking a new client or business to the project (so owner data can refresh). */
  onOwnerUpdated?: () => void;
}

/**
 * Project owner tab: client + business for this project in one view.
 * Shows summary cards with link to full profile; empty state links to edit project.
 */
export default function ContextOwnerClient({
  project,
  client,
  business,
  onOwnerUpdated,
}: ContextOwnerClientProps) {
  const { t } = useI18n();
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [businessModalOpen, setBusinessModalOpen] = useState(false);
  const [addBusinessModalOpen, setAddBusinessModalOpen] = useState(false);
  const [editClientModalOpen, setEditClientModalOpen] = useState(false);
  const [selectClientModalOpen, setSelectClientModalOpen] = useState(false);
  const [selectBusinessModalOpen, setSelectBusinessModalOpen] = useState(false);
  const [clientChoiceModalOpen, setClientChoiceModalOpen] = useState(false);
  const [businessChoiceModalOpen, setBusinessChoiceModalOpen] = useState(false);
  const [clientsList, setClientsList] = useState<Client[]>([]);
  const [businessesList, setBusinessesList] = useState<Business[]>([]);
  const hasAny = !!client || !!business;

  useEffect(() => {
    if (selectClientModalOpen) getClients().then(setClientsList);
  }, [selectClientModalOpen]);

  useEffect(() => {
    if (selectBusinessModalOpen && client)
      getBusinessesByClientId(client.id).then(setBusinessesList);
  }, [selectBusinessModalOpen, client]);

  const handleSelectClient = useCallback(
    async (selected: Client) => {
      const formData = new FormData();
      formData.set('id', project.id);
      formData.set('client_id', selected.id);
      const result = await updateProject(formData);
      if (result.ok) {
        setSelectClientModalOpen(false);
        onOwnerUpdated?.();
      } else {
        alert(result.error);
      }
    },
    [project.id, onOwnerUpdated]
  );

  const handleSelectBusiness = useCallback(
    async (selected: Business) => {
      const result = await linkBusinessToProject(project.id, selected.id);
      if (result.ok) {
        setSelectBusinessModalOpen(false);
        onOwnerUpdated?.();
      } else {
        alert(result.error);
      }
    },
    [project.id, onOwnerUpdated]
  );

  const handleClientCreated = useCallback(
    async (created?: Client) => {
      if (!created) return;
      const formData = new FormData();
      formData.set('id', project.id);
      formData.set('client_id', created.id);
      const result = await updateProject(formData);
      if (result.ok) {
        onOwnerUpdated?.();
      } else {
        alert(result.error);
      }
    },
    [project.id, onOwnerUpdated]
  );

  const handleBusinessCreated = useCallback(
    async (created?: Business) => {
      if (!created) return;
      const result = await linkBusinessToProject(project.id, created.id);
      if (!result.ok) {
        alert(result.error);
        return;
      }
      if (created.client_id && !project.client_id) {
        const fd = new FormData();
        fd.set('id', project.id);
        fd.set('client_id', created.client_id);
        await updateProject(fd);
      }
      onOwnerUpdated?.();
    },
    [project.id, project.client_id, onOwnerUpdated]
  );

  const clientChoiceModal = (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg shadow-xl border border-border max-w-sm w-full p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">
            {t('context.add_or_select_client')}
          </h3>
          <button
            type="button"
            onClick={() => setClientChoiceModalOpen(false)}
            className="p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              setClientChoiceModalOpen(false);
              setClientModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity text-left"
          >
            <Plus className="w-4 h-4 shrink-0" />
            {t('context.add_new_client')}
          </button>
          <button
            type="button"
            onClick={() => {
              setClientChoiceModalOpen(false);
              setSelectClientModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-lg border border-border bg-background text-foreground hover:bg-accent transition-colors text-left"
          >
            <UserCircle className="w-4 h-4 shrink-0" />
            {t('context.select_existing_client')}
          </button>
        </div>
      </div>
    </div>
  );

  const businessChoiceModal = (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg shadow-xl border border-border max-w-sm w-full p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">
            {t('context.add_or_select_business')}
          </h3>
          <button
            type="button"
            onClick={() => setBusinessChoiceModalOpen(false)}
            className="p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              setBusinessChoiceModalOpen(false);
              setAddBusinessModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity text-left"
          >
            <Plus className="w-4 h-4 shrink-0" />
            {t('context.add_new_business')}
          </button>
          <button
            type="button"
            onClick={() => {
              setBusinessChoiceModalOpen(false);
              setSelectBusinessModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-lg border border-border bg-background text-foreground hover:bg-accent transition-colors text-left"
          >
            <Building2 className="w-4 h-4 shrink-0" />
            {t('context.select_existing_business')}
          </button>
        </div>
      </div>
    </div>
  );

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
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => setClientChoiceModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition-opacity"
            >
              <UserCircle className="w-4 h-4" />
              {t('context.add_or_select_client')}
            </button>
            <button
              type="button"
              onClick={() => setBusinessChoiceModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition-opacity"
            >
              <Building2 className="w-4 h-4" />
              {t('context.add_or_select_business')}
            </button>
          </div>
          {selectClientModalOpen && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-background rounded-lg shadow-xl border border-border max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <h3 className="text-lg font-semibold text-foreground">
                    {t('context.select_existing_client')}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setSelectClientModalOpen(false)}
                    className="p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="overflow-y-auto p-2 flex-1">
                  {clientsList.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-4 text-center">
                      {t('context.no_clients_to_select')}
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {clientsList.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => handleSelectClient(c)}
                            className="w-full text-left px-4 py-3 rounded-lg hover:bg-accent text-foreground flex items-center gap-3"
                          >
                            <UserCircle className="w-5 h-5 text-primary shrink-0" />
                            <span className="font-medium">{c.full_name}</span>
                            {c.email && (
                              <span className="text-sm text-muted-foreground truncate ml-auto">
                                {c.email}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
          <CreateClientModal
            isOpen={clientModalOpen}
            onClose={() => setClientModalOpen(false)}
            onCreated={handleClientCreated}
          />
          <CreateBusinessModal
            isOpen={addBusinessModalOpen}
            onClose={() => setAddBusinessModalOpen(false)}
            onCreated={handleBusinessCreated}
          />
        </div>
      ) : (
        <div className="space-y-6">
          {client && (
            <section className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <UserCircle className="w-5 h-5 text-primary flex-shrink-0" />
                  <h3 className="font-semibold text-foreground truncate">
                    {client.full_name}
                  </h3>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditClientModalOpen(true)}
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    <Pencil className="w-4 h-4" />
                    <span className="hidden sm:inline">
                      {t('clients.edit_client')}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setClientModalOpen(true)}
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    <span className="hidden sm:inline">
                      {t('context.view_full_profile')}
                    </span>
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </div>
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

          {!business && client && (
            <div className="rounded-lg border border-dashed border-border bg-card/50 p-6 text-center">
              <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-3">
                {t('context.owner_empty_hint')}
              </p>
              <button
                type="button"
                onClick={() => setBusinessChoiceModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition-opacity"
              >
                <Building2 className="w-4 h-4" />
                {t('context.add_or_select_business')}
              </button>
            </div>
          )}
          {selectBusinessModalOpen && client && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-background rounded-lg shadow-xl border border-border max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <h3 className="text-lg font-semibold text-foreground">
                    {t('context.select_existing_business')}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setSelectBusinessModalOpen(false)}
                    className="p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="overflow-y-auto p-2 flex-1">
                  {businessesList.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-4 text-center">
                      {t('context.no_businesses_to_select')}
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {businessesList.map((b) => (
                        <li key={b.id}>
                          <button
                            type="button"
                            onClick={() => handleSelectBusiness(b)}
                            className="w-full text-left px-4 py-3 rounded-lg hover:bg-accent text-foreground flex items-center gap-3"
                          >
                            <Building2 className="w-5 h-5 text-primary shrink-0" />
                            <span className="font-medium">{b.name}</span>
                            {b.tagline && (
                              <span className="text-sm text-muted-foreground truncate ml-auto">
                                {b.tagline}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
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
            <>
              <ClientProfileModal
                clientId={client.id}
                open={clientModalOpen}
                onClose={() => setClientModalOpen(false)}
              />
              <EditClientModal
                client={client}
                isOpen={editClientModalOpen}
                onClose={() => setEditClientModalOpen(false)}
                onUpdated={onOwnerUpdated}
              />
            </>
          )}
          {business && (
            <BusinessProfileModal
              businessId={business.id}
              open={businessModalOpen}
              onClose={() => setBusinessModalOpen(false)}
            />
          )}
          <CreateBusinessModal
            clientId={client?.id}
            isOpen={addBusinessModalOpen}
            onClose={() => setAddBusinessModalOpen(false)}
            onCreated={handleBusinessCreated}
          />
        </div>
      )}
      {clientChoiceModalOpen && clientChoiceModal}
      {businessChoiceModalOpen && businessChoiceModal}
    </div>
  );
}
