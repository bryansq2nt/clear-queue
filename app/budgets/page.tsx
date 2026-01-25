import { requireAuth } from '@/lib/auth'
import BudgetsPageClient from './BudgetsPageClient'

export default async function BudgetsPage() {
  await requireAuth()

  return <BudgetsPageClient />
}
