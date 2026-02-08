import { requireAuth } from '@/lib/auth'
import ClientsPageClient from './ClientsPageClient'

export default async function ClientsPage() {
  await requireAuth()

  return <ClientsPageClient />
}
