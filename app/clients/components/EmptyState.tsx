'use client'

import { Users } from 'lucide-react'
import { useI18n } from '@/components/I18nProvider'

export function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  const { t } = useI18n()
  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-12 text-center">
      <div className="mx-auto w-24 h-24 bg-gradient-to-br from-slate-500 to-slate-600 rounded-full flex items-center justify-center mb-6">
        <Users className="w-12 h-12 text-white" />
      </div>

      <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
        {t('clients.no_clients_yet')}
      </h3>

      <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
        {t('clients.add_first_client_desc')}
      </p>

      <button
        onClick={onCreateClick}
        className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-slate-600 to-slate-700 text-white rounded-lg font-medium hover:from-slate-700 hover:to-slate-800 transition-all shadow-lg hover:shadow-xl"
      >
        <Users className="w-5 h-5 mr-2" />
        {t('clients.new_client')}
      </button>
    </div>
  )
}
