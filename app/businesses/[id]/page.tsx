import { requireAuth } from '@/lib/auth'
import { getBusinessById, getClientById } from '@/app/clients/actions'
import { notFound } from 'next/navigation'
import BusinessDetailClient from './BusinessDetailClient'

export default async function BusinessDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAuth()
  const { id } = await params
  const business = await getBusinessById(id)
  if (!business) notFound()
  const client = await getClientById(business.client_id)

  return (
    <BusinessDetailClient
      businessId={id}
      initialBusiness={business}
      clientName={client?.full_name ?? null}
    />
  )
}
