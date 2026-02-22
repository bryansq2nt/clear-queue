'use client';

import { useState, useEffect } from 'react';
import { X, Building2, ChevronDown, ChevronUp } from 'lucide-react';
import { useI18n } from '@/components/I18nProvider';
import { createBusinessAction, getClients } from '@/app/actions/clients';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Database } from '@/lib/supabase/types';

type Client = Database['public']['Tables']['clients']['Row'];
type Business = Database['public']['Tables']['businesses']['Row'];

interface CreateBusinessModalProps {
  /** When set (e.g. from client detail page), client is fixed and dropdown is hidden. When undefined (e.g. from businesses list), show client dropdown. */
  clientId?: string;
  isOpen: boolean;
  onClose: () => void;
  /** Called after successful create; receives the new business (e.g. to link to project). */
  onCreated?: (business?: Business) => void;
}

export function CreateBusinessModal({
  clientId: fixedClientId,
  isOpen,
  onClose,
  onCreated,
}: CreateBusinessModalProps) {
  const { t } = useI18n();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [showAddressMore, setShowAddressMore] = useState(false);

  const showClientDropdown = fixedClientId === undefined;

  useEffect(() => {
    if (isOpen && showClientDropdown) getClients().then(setClients);
  }, [isOpen, showClientDropdown]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const clientId = fixedClientId ?? selectedClientId;
    if (!clientId) {
      setError(t('businesses.error_select_client'));
      return;
    }
    setError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    setIsSubmitting(true);
    const result = await createBusinessAction(clientId, formData);
    setIsSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    form.reset();
    setSelectedClientId('');
    onClose();
    onCreated?.(result.data);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg shadow-xl border border-border max-w-lg w-full max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-background z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-primary-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              {t('businesses.create_modal_title')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-2">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-2.5 rounded-md">
              {error}
            </div>
          )}
          {showClientDropdown && (
            <div>
              <Label
                htmlFor="b-client"
                className="text-sm font-medium text-foreground"
              >
                {t('businesses.client_label')}
              </Label>
              <Select
                value={selectedClientId}
                onValueChange={setSelectedClientId}
                required
              >
                <SelectTrigger
                  id="b-client"
                  className="mt-0.5 h-8 text-sm border-input bg-background"
                >
                  <SelectValue placeholder={t('businesses.select_client')} />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label
              htmlFor="b-name"
              className="text-sm font-medium text-foreground"
            >
              {t('businesses.name_label')}
            </Label>
            <Input
              id="b-name"
              name="name"
              required
              placeholder={t('businesses.business_name_placeholder')}
              className="mt-0.5 h-8 text-sm border-input bg-background"
            />
          </div>
          <div>
            <Label
              htmlFor="b-tagline"
              className="text-sm font-medium text-foreground"
            >
              {t('businesses.tagline_label')}
            </Label>
            <Input
              id="b-tagline"
              name="tagline"
              placeholder={t('businesses.tagline_placeholder')}
              className="mt-0.5 h-8 text-sm border-input bg-background"
            />
          </div>
          <div>
            <Label
              htmlFor="b-description"
              className="text-sm font-medium text-foreground"
            >
              {t('businesses.description_label')}
            </Label>
            <Textarea
              id="b-description"
              name="description"
              rows={1}
              placeholder={t('businesses.optional_placeholder')}
              className="mt-0.5 text-sm min-h-[2rem] border-input bg-background resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label
                htmlFor="b-email"
                className="text-sm font-medium text-foreground"
              >
                {t('businesses.business_email_label')}
              </Label>
              <Input
                id="b-email"
                name="email"
                type="email"
                placeholder={t('businesses.business_email_placeholder')}
                className="mt-0.5 h-8 text-sm border-input bg-background"
              />
            </div>
            <div>
              <Label
                htmlFor="b-website"
                className="text-sm font-medium text-foreground"
              >
                {t('businesses.website_label')}
              </Label>
              <Input
                id="b-website"
                name="website"
                type="url"
                placeholder={t('businesses.website_placeholder')}
                className="mt-0.5 h-8 text-sm border-input bg-background"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAddressMore((v) => !v)}
            className="flex items-center gap-2 w-full text-sm text-muted-foreground hover:text-foreground py-1.5 rounded-md hover:bg-accent/50 transition-colors"
          >
            {showAddressMore ? (
              <ChevronUp className="w-4 h-4 shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 shrink-0" />
            )}
            <span>{t('businesses.address_and_more')}</span>
          </button>
          {showAddressMore && (
            <>
              <div>
                <Label className="text-sm font-medium text-foreground block mb-0.5">
                  {t('businesses.social_links_label')}
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {['instagram', 'facebook', 'tiktok', 'youtube'].map((k) => (
                    <Input
                      key={k}
                      name={`social_${k}`}
                      placeholder={k.charAt(0).toUpperCase() + k.slice(1)}
                      className="h-8 text-sm border-input bg-background"
                    />
                  ))}
                </div>
              </div>
              <div>
                <Label
                  htmlFor="b-address_line1"
                  className="text-sm font-medium text-foreground"
                >
                  {t('businesses.address_line1_label')}
                </Label>
                <Input
                  id="b-address_line1"
                  name="address_line1"
                  className="mt-0.5 h-8 text-sm border-input bg-background"
                />
              </div>
              <div>
                <Label
                  htmlFor="b-address_line2"
                  className="text-sm font-medium text-foreground"
                >
                  {t('businesses.address_line2_label')}
                </Label>
                <Input
                  id="b-address_line2"
                  name="address_line2"
                  className="mt-0.5 h-8 text-sm border-input bg-background"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label
                    htmlFor="b-city"
                    className="text-sm font-medium text-foreground"
                  >
                    {t('businesses.city_label')}
                  </Label>
                  <Input
                    id="b-city"
                    name="city"
                    className="mt-0.5 h-8 text-sm border-input bg-background"
                  />
                </div>
                <div>
                  <Label
                    htmlFor="b-state"
                    className="text-sm font-medium text-foreground"
                  >
                    {t('businesses.state_label')}
                  </Label>
                  <Input
                    id="b-state"
                    name="state"
                    className="mt-0.5 h-8 text-sm border-input bg-background"
                  />
                </div>
                <div>
                  <Label
                    htmlFor="b-postal_code"
                    className="text-sm font-medium text-foreground"
                  >
                    {t('businesses.postal_code_label')}
                  </Label>
                  <Input
                    id="b-postal_code"
                    name="postal_code"
                    className="mt-0.5 h-8 text-sm border-input bg-background"
                  />
                </div>
              </div>
              <div>
                <Label
                  htmlFor="b-notes"
                  className="text-sm font-medium text-foreground"
                >
                  {t('businesses.notes_label')}
                </Label>
                <Textarea
                  id="b-notes"
                  name="notes"
                  rows={1}
                  className="mt-0.5 text-sm min-h-[2rem] border-input bg-background resize-none"
                />
              </div>
            </>
          )}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm border border-border rounded-lg bg-background text-foreground hover:bg-accent transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 font-medium"
            >
              {isSubmitting
                ? t('businesses.creating')
                : t('businesses.create_business_btn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
