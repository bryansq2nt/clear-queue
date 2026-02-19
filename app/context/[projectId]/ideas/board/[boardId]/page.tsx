import type { ComponentProps } from 'react';
import { requireAuth } from '@/lib/auth';
import { getProjectById } from '@/app/actions/projects';
import { getBoardById } from '@/lib/idea-graph/boards';
import { getBoardDataAction } from '@/app/ideas/load-board-data';
import { listProjectsForPicker } from '@/lib/projects';
import { notFound } from 'next/navigation';
import ContextBoardViewClient from './ContextBoardViewClient';

type BoardItem = ComponentProps<
  typeof ContextBoardViewClient
>['initialItems'][number];

export default async function ContextIdeasBoardPage({
  params,
}: {
  params: { projectId: string; boardId: string };
}) {
  await requireAuth();
  const { projectId, boardId } = params;

  const [project, board, boardData, projects] = await Promise.all([
    getProjectById(projectId),
    getBoardById(boardId),
    getBoardDataAction(boardId),
    listProjectsForPicker(),
  ]);

  if (!project || !board) {
    notFound();
  }

  if (board.project_id !== projectId) {
    notFound();
  }

  if (boardData.error || !boardData.board) {
    notFound();
  }

  const items = (boardData.items || []).filter(
    (item) => item != null && item.idea != null
  ) as BoardItem[];

  return (
    <ContextBoardViewClient
      projectId={projectId}
      boardId={boardId}
      initialBoard={board}
      initialItems={items}
      initialConnections={boardData.connections || []}
      initialProjects={projects}
    />
  );
}
