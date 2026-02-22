'use client';

import { useState, useEffect } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { X, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { updateClientAction } from '@/app/actions/clients';
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
import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { Database } from '@/lib/supabase/types';

type Client = Database['public']['Tables']['clients']['Row'];

interface EditClientModalProps {
  client: Client | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}

export function EditClientModal({
  client,
  isOpen,
  onClose,
  onUpdated,
}: EditClientModalProps) {
  const { t } = useI18n();
  const GENDER_OPTIONS = [
    { value: 'male', label: t('clients.gender_male') },
    { value: 'female', label: t('clients.gender_female') },
    { value: 'not_specified', label: t('clients.gender_not_specified') },
  ];
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const genderValue =
    client?.gender === 'male' || client?.gender === 'female'
      ? client.gender
      : 'not_specified';
  const [gender, setGender] = useState<string>(genderValue);
  const [phone, setPhone] = useState<string>(client?.phone ?? '');
  const [showOptional, setShowOptional] = useState(false);

  useEffect(() => {
    if (client) {
      setGender(
        client.gender === 'male' || client.gender === 'female'
          ? client.gender
          : 'not_specified'
      );
      setPhone(client.phone ?? '');
      setShowOptional(false);
    }
  }, [client]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!client) return;
    setError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set('gender', gender === 'not_specified' ? '' : gender);
    formData.set('phone', phone?.trim() || '');
    setIsSubmitting(true);
    const result = await updateClientAction(client.id, formData);
    setIsSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onClose();
    onUpdated?.();
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen || !client) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg shadow-xl border border-border max-w-lg w-full max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-background z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-primary-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              {t('clients.edit_client')}
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

        <form onSubmit={handleSubmit} className="p-4 space-y-2.5">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-2.5 rounded-md">
              {error}
            </div>
          )}
          <div>
            <Label
              htmlFor="edit-full_name"
              className="text-sm font-medium text-foreground"
            >
              {t('clients.full_name')}
            </Label>
            <Input
              id="edit-full_name"
              name="full_name"
              defaultValue={client.full_name}
              required
              placeholder={t('clients.full_name_placeholder')}
              className="mt-0.5 h-8 text-sm border-input bg-background"
            />
          </div>
          <div>
            <Label
              htmlFor="edit-phone"
              className="text-sm font-medium text-foreground"
            >
              {t('clients.phone')}
            </Label>
            <PhoneInput
              id="edit-phone"
              international
              defaultCountry="US"
              value={phone}
              onChange={(v) => setPhone(v ?? '')}
              placeholder={t('clients.phone_placeholder')}
              className="PhoneInput-theme mt-0.5"
            />
          </div>
          <div>
            <Label
              htmlFor="edit-email"
              className="text-sm font-medium text-foreground"
            >
              {t('auth.email')}
            </Label>
            <Input
              id="edit-email"
              name="email"
              type="email"
              defaultValue={client.email ?? ''}
              placeholder={t('clients.email_placeholder')}
              className="mt-0.5 h-8 text-sm border-input bg-background"
            />
          </div>
          <div>
            <Label
              htmlFor="edit-address_line1"
              className="text-sm font-medium text-foreground"
            >
              {t('clients.address_line1')}
            </Label>
            <Input
              id="edit-address_line1"
              name="address_line1"
              defaultValue={client.address_line1 ?? ''}
              placeholder={t('clients.address_placeholder')}
              className="mt-0.5 h-8 text-sm border-input bg-background"
            />
          </div>
          <div>
            <Label
              htmlFor="edit-address_line2"
              className="text-sm font-medium text-foreground"
            >
              {t('clients.address_line2')}
            </Label>
            <Input
              id="edit-address_line2"
              name="address_line2"
              defaultValue={client.address_line2 ?? ''}
              placeholder={t('clients.apt_placeholder')}
              className="mt-0.5 h-8 text-sm border-input bg-background"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label
                htmlFor="edit-city"
                className="text-sm font-medium text-foreground"
              >
                {t('clients.city')}
              </Label>
              <Input
                id="edit-city"
                name="city"
                defaultValue={client.city ?? ''}
                className="mt-0.5 h-8 text-sm border-input bg-background"
              />
            </div>
            <div>
              <Label
                htmlFor="edit-state"
                className="text-sm font-medium text-foreground"
              >
                {t('clients.state')}
              </Label>
              <Input
                id="edit-state"
                name="state"
                defaultValue={client.state ?? ''}
                className="mt-0.5 h-8 text-sm border-input bg-background"
              />
            </div>
            <div>
              <Label
                htmlFor="edit-postal_code"
                className="text-sm font-medium text-foreground"
              >
                {t('clients.postal_code')}
              </Label>
              <Input
                id="edit-postal_code"
                name="postal_code"
                defaultValue={client.postal_code ?? ''}
                className="mt-0.5 h-8 text-sm border-input bg-background"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowOptional((v) => !v)}
            className="flex items-center gap-2 w-full text-sm text-muted-foreground hover:text-foreground py-1.5 rounded-md hover:bg-accent/50 transition-colors"
          >
            {showOptional ? (
              <ChevronUp className="w-4 h-4 shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 shrink-0" />
            )}
            <span>{t('clients.optional_details')}</span>
          </button>
          {showOptional && (
            <>
              <div>
                <Label
                  htmlFor="edit-gender"
                  className="text-sm font-medium text-foreground"
                >
                  {t('clients.gender')}
                </Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger
                    id="edit-gender"
                    className="mt-0.5 h-8 text-sm border-input bg-background"
                  >
                    <SelectValue placeholder={t('common.select')} />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDER_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label
                  htmlFor="edit-preferences"
                  className="text-sm font-medium text-foreground"
                >
                  {t('clients.preferences')}
                </Label>
                <Textarea
                  id="edit-preferences"
                  name="preferences"
                  rows={1}
                  defaultValue={client.preferences ?? ''}
                  className="mt-0.5 text-sm min-h-[2rem] border-input bg-background resize-none"
                />
              </div>
              <div>
                <Label
                  htmlFor="edit-notes"
                  className="text-sm font-medium text-foreground"
                >
                  {t('clients.notes')}
                </Label>
                <Textarea
                  id="edit-notes"
                  name="notes"
                  rows={1}
                  defaultValue={client.notes ?? ''}
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
              {isSubmitting ? t('clients.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
