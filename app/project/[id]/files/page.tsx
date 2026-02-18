import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { getProjectById } from '@/app/actions/projects';
import { listProjectDocumentsAction, listProjectMediaAction } from './actions';
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

  const [mediaResult, documentsResult] = await Promise.all([
    listProjectMediaAction({ projectId: id }),
    listProjectDocumentsAction({ projectId: id }),
  ]);

  return (
    <ProjectMediaVaultClient
      projectId={id}
      initialMedia={mediaResult.ok ? mediaResult.data : []}
      initialDocuments={documentsResult.ok ? documentsResult.data : []}
    />
  );
}
