import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { getProjectById } from '@/app/actions/projects';
import { getBudgets } from '@/app/budgets/actions';

export default async function ProjectBudgetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAuth();
  const { id } = await params;

  const [project, budgets] = await Promise.all([
    getProjectById(id),
    getBudgets(),
  ]);
  if (!project) notFound();

  const projectBudgets = budgets.filter((b) => b.project_id === id);

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="text-lg font-semibold mb-4">Presupuesto</h2>
      {projectBudgets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay presupuestos vinculados a este proyecto.
        </p>
      ) : (
        <ul className="space-y-3">
          {projectBudgets.map((budget) => (
            <li
              key={budget.id}
              className="rounded-lg border border-border bg-card p-4"
            >
              <Link
                href={`/budgets/${budget.id}`}
                className="font-medium text-foreground hover:underline"
              >
                {budget.name}
              </Link>
              {budget.description && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {budget.description}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
