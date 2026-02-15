import { requireAuth } from '@/lib/auth';
import NotesPageClient from './NotesPageClient';

export default async function NotesPage() {
  await requireAuth();
  return <NotesPageClient />;
}
