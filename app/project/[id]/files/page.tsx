import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { getProjectById } from '@/app/actions/projects';

export default async function ProjectFilesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAuth();
  const { id } = await params;

  const project = await getProjectById(id);
  if (!project) notFound();

  return (
    <div className="max-w-4xl mx-auto rounded-lg border border-border bg-card p-5">
      <h2 className="text-lg font-semibold mb-2">Files</h2>
      <p className="text-sm text-muted-foreground">
        Este proyecto aún no tiene un módulo de archivos dedicado en esta
        versión.
      </p>
    </div>
  );
}
