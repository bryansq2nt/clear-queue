import { requireAuth } from '@/lib/auth';
import ContextCalendarFromCache from './ContextCalendarFromCache';

export default async function ContextCalendarPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  return <ContextCalendarFromCache projectId={params.projectId} />;
}
