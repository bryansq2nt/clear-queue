import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { getProjectById } from '@/app/actions/projects';
import { getNotes } from '@/app/notes/actions';

export default async function ProjectNotesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAuth();
  const { id } = await params;

  const [project, notes] = await Promise.all([
    getProjectById(id),
    getNotes({ projectId: id }),
  ]);

  if (!project) notFound();

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Notas</h2>
        <Link
          href={`/notes/new?projectId=${id}`}
          className="inline-flex rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent"
        >
          Nueva nota
        </Link>
      </div>

      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay notas vinculadas a este proyecto.
        </p>
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => (
            <li
              key={note.id}
              className="rounded-lg border border-border bg-card p-4"
            >
              <Link
                href={`/notes/${note.id}`}
                className="font-medium text-foreground hover:underline"
              >
                {note.title || 'Sin título'}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
