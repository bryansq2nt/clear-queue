import { DollarSign } from 'lucide-react'

export function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-12 text-center">
      <div className="mx-auto w-24 h-24 bg-primary rounded-full flex items-center justify-center mb-6">
        <DollarSign className="w-12 h-12 text-primary-foreground" />
      </div>
      
      <h3 className="text-xl font-semibold text-foreground mb-2">
        No budgets yet
      </h3>
      
      <p className="text-muted-foreground mb-6 max-w-md mx-auto">
        Create your first budget to start tracking purchases, equipment, and expenses for your projects.
      </p>
      
      <button
        onClick={onCreateClick}
        className="inline-flex items-center px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-all shadow-lg hover:shadow-xl"
      >
        <DollarSign className="w-5 h-5 mr-2" />
        Create First Budget
      </button>
    </div>
  )
}
