import { requireAuth } from '@/lib/auth'
import DashboardClient from '@/components/DashboardClient'

export default async function Dashboard() {
  await requireAuth()

  return <DashboardClient />
}
