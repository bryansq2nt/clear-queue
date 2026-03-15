'use client';

import { useI18n } from '@/components/shared/I18nProvider';
import { MODULE_REGISTRY, type ModuleKey } from '@/lib/modules/registry';

interface ModuleDisabledViewProps {
  moduleKey: ModuleKey;
  projectId: string;
  /** When 'no_access', user has no grant for this module; when 'project_disabled', project has module off. */
  reason?: 'no_access' | 'project_disabled';
}

export function ModuleDisabledView({
  moduleKey,
  projectId,
  reason = 'project_disabled',
}: ModuleDisabledViewProps) {
  const { t } = useI18n();
  const mod = MODULE_REGISTRY[moduleKey];
  const Icon = mod.icon;
  const isNoAccess = reason === 'no_access';
  const title = isNoAccess
    ? t('modules.module_no_access_title')
    : t('modules.module_disabled_title');
  const description = isNoAccess
    ? t('modules.module_no_access_description')
    : t('modules.module_disabled_description');

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center min-h-[300px]">
      <Icon className="w-12 h-12 text-muted-foreground/30" aria-hidden />
      <div className="max-w-xs">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
      {!isNoAccess && (
        <a
          href={`/context/${projectId}?settings=modules`}
          className="text-xs text-primary underline-offset-4 hover:underline"
        >
          {t('modules.module_disabled_cta')}
        </a>
      )}
    </div>
  );
}
