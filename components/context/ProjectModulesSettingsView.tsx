'use client';

import { useState } from 'react';
import { useI18n } from '@/components/shared/I18nProvider';
import { Switch } from '@/components/ui/switch';
import { toastSuccess, toastError } from '@/lib/ui/toast';
import { setProjectModuleEnabled } from '@/app/actions/modules';
import {
  MODULE_REGISTRY,
  type ModuleKey,
  type SerializableResolvedModule,
} from '@/lib/modules/registry';

interface ProjectModulesSettingsViewProps {
  projectId: string;
  modules: SerializableResolvedModule[];
  canToggleModules: boolean;
  onModulesChange: (updated: SerializableResolvedModule[]) => void;
}

export function ProjectModulesSettingsView({
  projectId,
  modules,
  canToggleModules,
  onModulesChange,
}: ProjectModulesSettingsViewProps) {
  const { t } = useI18n();
  const [loadingKey, setLoadingKey] = useState<ModuleKey | null>(null);

  const handleToggle = async (moduleKey: ModuleKey, newEnabled: boolean) => {
    setLoadingKey(moduleKey);

    // Optimistic update
    const optimistic = modules.map((m) =>
      m.key === moduleKey ? { ...m, enabled: newEnabled } : m
    );
    onModulesChange(optimistic);

    const result = await setProjectModuleEnabled(
      projectId,
      moduleKey,
      newEnabled
    );

    setLoadingKey(null);

    if (result.ok) {
      toastSuccess(
        newEnabled
          ? t('modules.toggle_enabled_toast')
          : t('modules.toggle_disabled_toast')
      );
    } else {
      // Revert optimistic update
      const reverted = modules.map((m) =>
        m.key === moduleKey ? { ...m, enabled: !newEnabled } : m
      );
      onModulesChange(reverted);
      toastError(result.error);
    }
  };

  const visibleModules = modules.filter((m) => m.nav.showInProjectTabs);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          {t('modules.title')}
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t('modules.subtitle')}
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {visibleModules.map((mod) => {
          // Look up icon from MODULE_REGISTRY — icons are not serializable and
          // cannot be stored in state or passed through the server boundary.
          const Icon = MODULE_REGISTRY[mod.key].icon;
          const isLoading = loadingKey === mod.key;

          return (
            <li
              key={mod.key}
              className="flex items-center gap-3 rounded-lg border border-border p-3"
            >
              <Icon
                className="w-4 h-4 text-muted-foreground flex-shrink-0"
                aria-hidden
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-snug">
                  {t(mod.labelKey)}
                </p>
                <p className="text-xs text-muted-foreground leading-snug mt-0.5">
                  {t(mod.descriptionKey)}
                </p>
              </div>
              <div
                title={
                  mod.lock
                    ? t('modules.essential_tooltip')
                    : !canToggleModules
                      ? t('modules.no_toggle_permission_tooltip')
                      : undefined
                }
              >
                <Switch
                  checked={mod.enabled}
                  onCheckedChange={(checked) => {
                    if (!isLoading && canToggleModules) {
                      void handleToggle(mod.key, checked);
                    }
                  }}
                  disabled={!canToggleModules || mod.lock || isLoading}
                  aria-label={
                    mod.lock
                      ? t('modules.essential_tooltip')
                      : !canToggleModules
                        ? t('modules.no_toggle_permission_tooltip')
                        : t(mod.labelKey)
                  }
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
