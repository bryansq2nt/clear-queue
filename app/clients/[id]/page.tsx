import { requireAuth } from '@/lib/auth'
import { getClientById } from '../actions'
import { notFound } from 'next/navigation'
import ClientDetailClient from './ClientDetailClient'

export default async function ClientDetailPage({
  params,
}: {
  params: { id: string }
}) {
  await requireAuth()
  const client = await getClientById(params.id)
  if (!client) notFound()

  return <ClientDetailClient clientId={params.id} initialClient={client} />
}
