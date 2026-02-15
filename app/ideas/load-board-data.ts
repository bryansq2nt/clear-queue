'use server';

import { requireAuth } from '@/lib/auth';
import { getBoardById, listBoardItems } from '@/lib/idea-graph/boards';
import { getIdeasByIds } from '@/lib/idea-graph/ideas';
import { listConnections } from '@/lib/idea-graph/connections';

export async function getBoardDataAction(boardId: string) {
  await requireAuth();

  const board = await getBoardById(boardId);
  if (!board) {
    return { error: 'Board not found' };
  }

  const boardItems = await listBoardItems(boardId);

  // Get unique idea IDs from board items
  const ideaIds = Array.from(
    new Set(boardItems.map((item) => item.idea_id).filter(Boolean))
  );

  // Fetch all ideas in one query
  const ideas = await getIdeasByIds(ideaIds);

  // Create a map for quick lookup
  const ideasMap = new Map(ideas.map((idea) => [idea.id, idea]));

  // Combine board items with their idea data
  const itemsWithIdeas = boardItems
    .map((item) => ({
      ...item,
      idea: ideasMap.get(item.idea_id),
    }))
    .filter((item) => item.idea); // Only include items with valid ideas

  // Load all connections and filter for this board
  const allConnections = await listConnections();
  const ideaIdsSet = new Set(ideaIds);
  const connectionsForBoard = allConnections.filter(
    (conn) =>
      ideaIdsSet.has(conn.from_idea_id) && ideaIdsSet.has(conn.to_idea_id)
  );

  return {
    board,
    items: itemsWithIdeas,
    connections: connectionsForBoard,
  };
}
