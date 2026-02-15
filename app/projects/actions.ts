'use server';

import { getNotes } from '@/app/notes/actions';
import { getBudgets } from '@/app/budgets/actions';
import { listBoards } from '@/lib/idea-graph/boards';
import { getTodoLists } from '@/lib/todo/lists';

export type ProjectResourceBudget = { id: string; name: string };
export type ProjectResourceNote = { id: string; title: string };
export type ProjectResourceBoard = { id: string; name: string };
export type ProjectResourceTodoList = { id: string; title: string };

export type ProjectResources = {
  budgets: ProjectResourceBudget[];
  notes: ProjectResourceNote[];
  boards: ProjectResourceBoard[];
  todoLists: ProjectResourceTodoList[];
};

export async function getProjectResources(
  projectId: string
): Promise<ProjectResources> {
  if (!projectId?.trim()) {
    return { budgets: [], notes: [], boards: [], todoLists: [] };
  }

  const [notes, allBudgets, allBoards, todoLists] = await Promise.all([
    getNotes({ projectId }),
    getBudgets(),
    listBoards(),
    getTodoLists({ projectId, includeArchived: false }),
  ]);

  const budgets = (
    allBudgets as { id: string; name: string; project_id: string | null }[]
  )
    .filter((b) => b.project_id === projectId)
    .map((b) => ({ id: b.id, name: b.name }));

  const boards = allBoards
    .filter((b) => b.project_id === projectId)
    .map((b) => ({ id: b.id, name: b.name }));

  return {
    budgets,
    notes: notes.map((n) => ({ id: n.id, title: n.title || '' })),
    boards,
    todoLists: todoLists.map((t) => ({ id: t.id, title: t.title || '' })),
  };
}
