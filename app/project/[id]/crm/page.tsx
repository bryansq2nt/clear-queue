import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { getProjectById } from '@/app/actions/projects';

export default async function ProjectCrmPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAuth();
  const { id } = await params;

  const project = await getProjectById(id);
  if (!project) notFound();

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <h2 className="text-lg font-semibold">CRM</h2>

      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
          Cliente
        </p>
        {project.client_id ? (
          <Link
            href={`/clients/${project.client_id}`}
            className="font-medium text-foreground hover:underline"
          >
            Ver cliente asociado
          </Link>
        ) : (
          <p className="text-sm text-muted-foreground">
            Sin cliente vinculado.
          </p>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
          Empresa
        </p>
        {project.business_id ? (
          <Link
            href={`/businesses/${project.business_id}`}
            className="font-medium text-foreground hover:underline"
          >
            Ver empresa asociada
          </Link>
        ) : (
          <p className="text-sm text-muted-foreground">
            Sin empresa vinculada.
          </p>
        )}
      </div>
    </div>
  );
}
