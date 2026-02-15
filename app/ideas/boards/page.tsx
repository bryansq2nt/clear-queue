import { requireAuth } from '@/lib/auth';
import { listBoards } from '@/lib/idea-graph/boards';
import { createBoardFormAction } from './actions';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import Link from 'next/link';

export default async function BoardsPage() {
  await requireAuth();

  const boards = await listBoards();

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-8">
        <div className="mb-4">
          <Link
            href="/ideas"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back to Ideas
          </Link>
        </div>
        <h1 className="text-3xl font-bold mb-4">Idea Boards</h1>

        {/* Create Board Form */}
        <div className="bg-white rounded-lg border p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">New Board</h2>
          <form action={createBoardFormAction} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium mb-2">
                Name <span className="text-red-500">*</span>
              </label>
              <Input
                id="name"
                name="name"
                type="text"
                required
                placeholder="Enter board name"
                className="w-full"
              />
            </div>
            <div>
              <label
                htmlFor="description"
                className="block text-sm font-medium mb-2"
              >
                Description
              </label>
              <Textarea
                id="description"
                name="description"
                rows={3}
                placeholder="Enter board description (optional)"
              />
            </div>
            <Button type="submit">Create Board</Button>
          </form>
        </div>

        {/* Boards List */}
        {boards.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No boards yet.
          </div>
        ) : (
          <div className="space-y-3">
            {boards.map((board) => (
              <Link
                key={board.id}
                href={`/ideas/boards/${board.id}`}
                className="block bg-white rounded-lg border p-4 hover:border-primary transition-colors"
              >
                <h3 className="font-semibold text-lg mb-2">{board.name}</h3>
                {board.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {board.description}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  {new Date(board.created_at).toLocaleDateString()}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
