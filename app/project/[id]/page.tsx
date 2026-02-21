import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';

export default async function ProjectPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAuth();
  const id = params.id;
  redirect(`/context/${id}/board`);
}
