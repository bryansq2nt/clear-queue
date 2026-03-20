'use client';

import { useState, useEffect } from 'react';
import { useI18n } from '@/components/shared/I18nProvider';
import { createProject } from '@/app/actions/projects';
import { setProjectModuleEnabled } from '@/app/actions/modules';
import { getClients, getBusinessesByClientId } from '@/app/actions/clients';
import {
  ORDERED_MODULES,
  MODULE_REGISTRY,
  type ModuleKey,
  type ModuleDefinition,
} from '@/lib/modules/registry';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
import { PROJECT_CATEGORIES } from '@/lib/constants';
import type { Database } from '@/lib/supabase/types';

type Client = Database['public']['Tables']['clients']['Row'];
type Business = Database['public']['Tables']['businesses']['Row'];

interface AddProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectAdded: (projectId: string) => void;
  /** When opening from business detail, pre-fill client and business. */
  defaultClientId?: string;
  defaultBusinessId?: string;
}

const COLORS = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#eab308',
  '#84cc16',
  '#22c55e',
  '#10b981',
  '#14b8a6',
  '#06b6d4',
  '#0ea5e9',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#d946ef',
  '#ec4899',
  '#f43f5e',
  '#94a3b8',
  '#64748b',
  '#475569',
];

export function AddProjectModal({
  isOpen,
  onClose,
  onProjectAdded,
  defaultClientId,
  defaultBusinessId,
}: AddProjectModalProps) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('business');
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string>('');
  const [businessId, setBusinessId] = useState<string>('');
  const [clients, setClients] = useState<Client[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [moduleOverrides, setModuleOverrides] = useState<
    Map<ModuleKey, boolean>
  >(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorTitle, setErrorTitle] = useState<string>(t('common.error'));
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);

  useEffect(() => {
    if (isOpen) getClients().then(setClients);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && defaultClientId) setClientId(defaultClientId);
  }, [isOpen, defaultClientId]);
  useEffect(() => {
    if (isOpen && defaultBusinessId) setBusinessId(defaultBusinessId);
  }, [isOpen, defaultBusinessId]);

  useEffect(() => {
    if (!clientId) {
      setBusinesses([]);
      setBusinessId('');
      return;
    }
    getBusinessesByClientId(clientId).then((list) => {
      setBusinesses(list);
      setBusinessId((prev) => (list.some((b) => b.id === prev) ? prev : ''));
    });
  }, [clientId]);

  function getModuleEnabled(mod: ModuleDefinition): boolean {
    if (moduleOverrides.has(mod.key)) return moduleOverrides.get(mod.key)!;
    return mod.defaultEnabled;
  }

  function toggleModule(key: ModuleKey, newValue: boolean) {
    setModuleOverrides((prev) => {
      const next = new Map(prev);
      next.set(key, newValue);
      return next;
    });
  }

  function presentError(rawError: string | null | undefined) {
    setErrorTitle(t('common.error'));
    let message =
      typeof rawError === 'string' && rawError.trim().length > 0
        ? rawError
        : t('common.error');

    if (
      rawError === 'quota_projects_per_org' ||
      rawError?.startsWith('quota_projects_per_org:')
    ) {
      setErrorTitle(t('projects.quota_limit_title'));
      const quotaMatch = rawError?.match(
        /^quota_projects_per_org:(\d+):(\d+)$/
      );
      if (quotaMatch) {
        const currentCount = Number(quotaMatch[1]);
        const maxAllowed = Number(quotaMatch[2]);
        message = t('projects.quota_limit_message_with_numbers', {
          current: currentCount,
          max: maxAllowed,
        });
      } else {
        message = t('projects.quota_limit_message');
      }
    }

    setError(message);
    setErrorDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('category', category);
      if (description.trim()) formData.append('notes', description.trim());
      if (selectedColor) formData.append('color', selectedColor);
      if (clientId) formData.append('client_id', clientId);
      if (businessId) formData.append('business_id', businessId);

      const result = await createProject(formData);

      if (!result.ok) {
        presentError(result.error);
        return;
      }

      // Apply module overrides that differ from registry defaults.
      // A module setup failure should not block opening the created project.
      const projectId = result.data.id;
      const overridesToApply = ORDERED_MODULES.filter((mod) => {
        if (mod.lock) return false;
        const override = moduleOverrides.get(mod.key);
        return override !== undefined && override !== mod.defaultEnabled;
      });

      if (overridesToApply.length > 0) {
        try {
          await Promise.all(
            overridesToApply.map((mod) =>
              setProjectModuleEnabled(
                projectId,
                mod.key,
                moduleOverrides.get(mod.key)!
              )
            )
          );
        } catch {
          // Project creation already succeeded; keep UX moving.
        }
      }

      setName('');
      setDescription('');
      setCategory('business');
      setSelectedColor(null);
      setClientId('');
      setBusinessId('');
      setModuleOverrides(new Map());
      onProjectAdded(projectId);
      onClose();
    } catch (err) {
      const message =
        err instanceof Error && err.message.trim().length > 0
          ? err.message
          : 'No se pudo crear el proyecto';
      presentError(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('projects.add_title')}</DialogTitle>
            <DialogDescription>
              {t('projects.add_description')}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="max-h-[60vh] overflow-y-auto space-y-4 py-4 pr-1">
              <div className="space-y-2">
                <Label htmlFor="name">{t('projects.project_name')}</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('projects.project_name_placeholder')}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">
                  {t('projects.description_optional')}
                </Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('projects.description_placeholder')}
                  rows={3}
                  className="resize-none"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">{t('projects.category')}</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_CATEGORIES.filter((c) => c.key !== 'archived').map(
                      (cat) => (
                        <SelectItem key={cat.key} value={cat.key}>
                          {t(`categories.${cat.key}`)}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="client">{t('projects.client_optional')}</Label>
                <Select
                  value={clientId || 'none'}
                  onValueChange={(v) => setClientId(v === 'none' ? '' : v)}
                >
                  <SelectTrigger id="client">
                    <SelectValue placeholder={t('projects.select_client')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      {t('projects.no_client')}
                    </SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {clientId && (
                <div className="space-y-2">
                  <Label htmlFor="business">
                    {t('projects.business_optional')}
                  </Label>
                  <Select
                    value={businessId || 'none'}
                    onValueChange={(v) => setBusinessId(v === 'none' ? '' : v)}
                  >
                    <SelectTrigger id="business">
                      <SelectValue
                        placeholder={t('projects.select_business')}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        {t('projects.no_business')}
                      </SelectItem>
                      {businesses.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>{t('projects.color_optional')}</Label>
                <div className="grid grid-cols-10 gap-2">
                  {COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() =>
                        setSelectedColor(selectedColor === color ? null : color)
                      }
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        selectedColor === color
                          ? 'border-slate-900 scale-110'
                          : 'border-slate-300 hover:border-slate-500'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <Label>{t('projects.modules_label')}</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('projects.modules_hint')}
                  </p>
                </div>
                <div className="space-y-2">
                  {ORDERED_MODULES.map((mod) => {
                    const Icon = MODULE_REGISTRY[mod.key].icon;
                    const enabled = getModuleEnabled(mod);
                    return (
                      <label
                        key={mod.key}
                        className={`flex items-center gap-3 rounded-md border px-3 py-2 transition-colors ${
                          mod.lock
                            ? 'bg-muted/40 cursor-not-allowed opacity-60'
                            : 'cursor-pointer hover:bg-muted/30'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={enabled}
                          disabled={mod.lock}
                          onChange={(e) =>
                            toggleModule(mod.key, e.target.checked)
                          }
                          className="h-4 w-4 rounded border-gray-300 text-primary"
                        />
                        <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm flex-1">
                          {t(mod.labelKey)}
                        </span>
                        {mod.lock && (
                          <span className="text-xs text-muted-foreground">
                            Always on
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading
                  ? t('projects.creating')
                  : t('projects.create_project')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{errorTitle}</DialogTitle>
            <DialogDescription>{error ?? t('common.error')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" onClick={() => setErrorDialogOpen(false)}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
