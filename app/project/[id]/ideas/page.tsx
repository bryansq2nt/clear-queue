import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { getProjectById } from '@/app/actions/projects';
import { listBoards } from '@/lib/idea-graph/boards';

export default async function ProjectIdeasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAuth();
  const { id } = await params;

  const [project, boards] = await Promise.all([
    getProjectById(id),
    listBoards(),
  ]);
  if (!project) notFound();

  const projectBoards = boards.filter((board) => board.project_id === id);

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="text-lg font-semibold mb-4">Ideas</h2>
      {projectBoards.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay tableros de ideas para este proyecto.
        </p>
      ) : (
        <ul className="space-y-3">
          {projectBoards.map((board) => (
            <li
              key={board.id}
              className="rounded-lg border border-border bg-card p-4"
            >
              <Link
                href={`/ideas/boards/${board.id}`}
                className="font-medium text-foreground hover:underline"
              >
                {board.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
