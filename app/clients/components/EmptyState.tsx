'use client'

import { Users } from 'lucide-react'
import { useI18n } from '@/components/I18nProvider'

export function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  const { t } = useI18n()
  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-12 text-center">
      <div className="mx-auto w-24 h-24 bg-primary rounded-full flex items-center justify-center mb-6">
        <Users className="w-12 h-12 text-primary-foreground" />
      </div>

      <h3 className="text-xl font-semibold text-foreground mb-2">
        {t('clients.no_clients_yet')}
      </h3>

      <p className="text-muted-foreground mb-6 max-w-md mx-auto">
        {t('clients.add_first_client_desc')}
      </p>

      <button
        onClick={onCreateClick}
        className="inline-flex items-center px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity shadow-lg"
      >
        <Users className="w-5 h-5 mr-2" />
        {t('clients.new_client')}
      </button>
    </div>
  )
}
