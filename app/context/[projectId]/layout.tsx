import { requireAuth } from '@/lib/auth';
import ContextLayoutWrapper from './ContextLayoutWrapper';

export default async function ContextProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { projectId: string };
}) {
  await requireAuth();
  const projectId = params.projectId;

  return (
    <ContextLayoutWrapper projectId={projectId}>{children}</ContextLayoutWrapper>
  );
}
