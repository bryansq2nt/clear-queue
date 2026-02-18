import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { getProjectById } from '@/app/actions/projects';
import { getProjectResources } from '@/app/projects/actions';

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAuth();
  const { id } = await params;

  const [project, resources] = await Promise.all([
    getProjectById(id),
    getProjectResources(id),
  ]);

  if (!project) notFound();

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card title="Tasks" value={String(resources.todoLists.length)} />
        <Card title="Budgets" value={String(resources.budgets.length)} />
        <Card title="Ideas" value={String(resources.boards.length)} />
        <Card title="Notes" value={String(resources.notes.length)} />
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-lg font-semibold text-foreground mb-2">
          Resumen del proyecto
        </h2>
        <p className="text-sm text-muted-foreground">
          Usa las pestañas para navegar entre módulos sin salir del contexto de
          <span className="text-foreground font-medium"> {project.name}</span>.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <QuickLink href={`/project/${id}/tasks`} label="Ir a tareas" />
          <QuickLink href={`/project/${id}/budget`} label="Ir a presupuesto" />
          <QuickLink href={`/project/${id}/notes`} label="Ir a notas" />
        </div>
      </section>
    </div>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:bg-accent"
    >
      {label}
    </Link>
  );
}
