import { requireAuth } from '@/lib/auth'
import BusinessesPageClient from './BusinessesPageClient'

export default async function BusinessesPage() {
  await requireAuth()

  return <BusinessesPageClient />
}
