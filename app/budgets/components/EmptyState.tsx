import { DollarSign } from 'lucide-react'

export function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
      <div className="mx-auto w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mb-6">
        <DollarSign className="w-12 h-12 text-white" />
      </div>
      
      <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
        No budgets yet
      </h3>
      
      <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
        Create your first budget to start tracking purchases, equipment, and expenses for your projects.
      </p>
      
      <button
        onClick={onCreateClick}
        className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl"
      >
        <DollarSign className="w-5 h-5 mr-2" />
        Create First Budget
      </button>
    </div>
  )
}
