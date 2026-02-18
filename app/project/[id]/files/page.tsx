import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { getProjectById } from '@/app/actions/projects';
import { listProjectMediaAction } from './actions';
import { ProjectMediaVaultClient } from './ProjectMediaVaultClient';

export default async function ProjectFilesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAuth();
  const { id } = await params;

  const project = await getProjectById(id);
  if (!project) notFound();

  const mediaResult = await listProjectMediaAction({ projectId: id });
  const initialMedia = mediaResult.ok ? mediaResult.data : [];

  return <ProjectMediaVaultClient projectId={id} initialMedia={initialMedia} />;
}
