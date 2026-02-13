import { requireAuth } from '@/lib/auth'
import BillingsPageClient from './BillingsPageClient'

export default async function BillingsPage() {
  await requireAuth()
  return <BillingsPageClient />
}
