import { requireAuth } from '@/lib/auth';
import { getBoardById, listBoardItems } from '@/lib/idea-graph/boards';
import { getIdeasByIds } from '@/lib/idea-graph/ideas';
import { listConnections } from '@/lib/idea-graph/connections';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import BoardCanvasClient from './BoardCanvas.client';

export default async function BoardCanvasPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAuth();

  const board = await getBoardById(params.id);

  if (!board) {
    redirect('/ideas/boards');
  }

  const boardItems = await listBoardItems(params.id);

  // Get unique idea IDs from board items
  const ideaIds = Array.from(
    new Set(boardItems.map((item) => item.idea_id).filter(Boolean))
  );

  // Fetch all ideas in one query
  const ideas = await getIdeasByIds(ideaIds);

  // Create a map for quick lookup
  const ideasMap = new Map(ideas.map((idea) => [idea.id, idea]));

  // Combine board items with their idea data
  interface BoardItemWithIdea {
    id: string;
    idea_id: string;
    x: number;
    y: number;
    idea: {
      id: string;
      title: string;
      description: string | null;
    };
  }

  const itemsWithIdeas: BoardItemWithIdea[] = boardItems
    .map((item) => {
      const idea = ideasMap.get(item.idea_id);
      if (!idea) return null;
      return {
        id: item.id,
        idea_id: item.idea_id,
        x: item.x,
        y: item.y,
        idea: {
          id: idea.id,
          title: idea.title,
          description: idea.description,
        },
      };
    })
    .filter((item): item is BoardItemWithIdea => item !== null);

  // Load all connections and filter for this board
  const allConnections = await listConnections();
  const ideaIdsSet = new Set(ideaIds);
  const connectionsForBoard = allConnections.filter(
    (conn) =>
      ideaIdsSet.has(conn.from_idea_id) && ideaIdsSet.has(conn.to_idea_id)
  );

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="bg-card border-b border-border p-4">
        <div className="container mx-auto max-w-full">
          <div className="flex items-center justify-between">
            <div>
              <Link
                href={`/ideas/boards/${params.id}`}
                className="text-sm text-muted-foreground hover:text-foreground mb-1 block"
              >
                ← Back to Board
              </Link>
              <h1 className="text-2xl font-bold text-foreground">
                {board.name}
              </h1>
            </div>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <BoardCanvasClient
        items={itemsWithIdeas}
        connections={connectionsForBoard}
      />
    </div>
  );
}
