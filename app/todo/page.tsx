import { requireAuth } from '@/lib/auth';
import TodoPageClient from './TodoPageClient';

export default async function TodoPage() {
  await requireAuth();

  return <TodoPageClient />;
}
