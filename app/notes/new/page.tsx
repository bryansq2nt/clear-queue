import { requireAuth } from '@/lib/auth'
import NewNoteClient from './NewNoteClient'

export default async function NewNotePage() {
  await requireAuth()
  return <NewNoteClient />
}
