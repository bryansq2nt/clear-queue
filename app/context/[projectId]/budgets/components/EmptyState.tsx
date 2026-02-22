'use client';

import { DollarSign } from 'lucide-react';
import { useI18n } from '@/components/shared/I18nProvider';

export function EmptyState() {
  const { t } = useI18n();
  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-12 text-center">
      <div className="mx-auto w-24 h-24 bg-primary rounded-full flex items-center justify-center mb-6">
        <DollarSign className="w-12 h-12 text-primary-foreground" />
      </div>

      <h3 className="text-xl font-semibold text-foreground mb-2">
        {t('budgets.no_budgets_yet')}
      </h3>

      <p className="text-muted-foreground max-w-md mx-auto">
        {t('budgets.no_budgets_hint')}
      </p>
    </div>
  );
}
