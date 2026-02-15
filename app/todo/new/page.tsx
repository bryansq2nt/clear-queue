import { requireAuth } from '@/lib/auth';
import NewTodoListClient from './NewTodoListClient';

export default async function NewTodoListPage() {
  await requireAuth();
  return <NewTodoListClient />;
}
