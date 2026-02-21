'use server';

import { requireAuth } from '@/lib/auth';
import { captureWithContext } from '@/lib/sentry';
import { createClient } from '@/lib/supabase/server';
import { listProjectLinksForProjectIds } from '@/lib/idea-graph/project-links';
import { getIdeasByIds, listIdeas } from '@/lib/idea-graph/ideas';
import { listBoards, updateBoard } from '@/lib/idea-graph/boards';
import { getBusinessById } from '@/app/clients/actions';
import { updateProject } from '@/app/actions/projects';
import { updateBudget } from '@/app/budgets/actions';
import type { Database } from '@/lib/supabase/types';

type Idea = Database['public']['Tables']['ideas']['Row'];
type IdeaProjectLink =
  Database['public']['Tables']['idea_project_links']['Row'];

export type IdeaLinkWithIdea = IdeaProjectLink & { idea: Idea | null };

/** Projects with business_id for filtering in "link project" modal. */
export async function listProjectsWithBusinessIdAction(): Promise<
  { id: string; name: string; business_id: string | null }[]
> {
  await requireAuth();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, business_id')
    .order('name', { ascending: true });
  if (error) return [];
  return (data || []) as {
    id: string;
    name: string;
    business_id: string | null;
  }[];
}

/**
 * Link an existing project to this business.
 * Ownership: the business owns its projects. We set project.business_id and project.client_id
 * to the business's current client so the project follows the business.
 */
export async function linkProjectToBusinessAction(
  projectId: string,
  businessId: string
): Promise<{ error?: string }> {
  await requireAuth();
  const business = await getBusinessById(businessId);
  if (!business) return { error: 'Business not found' };
  const formData = new FormData();
  formData.set('id', projectId);
  formData.set('business_id', businessId);
  formData.set('client_id', business.client_id);
  const result = await updateProject(formData);
  return !result.ok ? { error: result.error } : {};
}

/** List all idea boards for the current user (for link board to project). */
export async function listBoardsForPickerAction() {
  await requireAuth();
  return listBoards();
}

/** Link an idea board to a project (set board.project_id). */
export async function linkBoardToProjectAction(
  boardId: string,
  projectId: string
): Promise<{ error?: string }> {
  await requireAuth();
  try {
    await updateBoard(boardId, { project_id: projectId });
    return {};
  } catch (e) {
    captureWithContext(e, {
      module: 'businesses',
      action: 'linkBoardToProjectAction',
      userIntent: 'Vincular board de ideas al proyecto',
      expected: 'El board queda asociado al proyecto',
      extra: { boardId, projectId },
    });
    return { error: e instanceof Error ? e.message : 'Failed to link board' };
  }
}

/** Link an existing budget to a project (set budget.project_id). */
export async function linkBudgetToProjectAction(
  budgetId: string,
  projectId: string
): Promise<{ error?: string }> {
  await requireAuth();
  try {
    await updateBudget(budgetId, { project_id: projectId });
    return {};
  } catch (e) {
    captureWithContext(e, {
      module: 'businesses',
      action: 'linkBudgetToProjectAction',
      userIntent: 'Vincular presupuesto al proyecto',
      expected: 'El presupuesto queda asociado al proyecto',
      extra: { budgetId, projectId },
    });
    return { error: e instanceof Error ? e.message : 'Failed to link budget' };
  }
}

/**
 * Get idea-project links for the given project IDs, with idea details attached.
 */
export async function getIdeasLinkedToProjectIds(
  projectIds: string[]
): Promise<IdeaLinkWithIdea[]> {
  await requireAuth();
  if (!projectIds || projectIds.length === 0) return [];

  const links = await listProjectLinksForProjectIds(projectIds);
  const ideaIds = Array.from(
    new Set(links.map((l) => l.idea_id).filter(Boolean))
  ) as string[];
  if (ideaIds.length === 0) {
    return links.map((link) => ({ ...link, idea: null }));
  }
  const ideas = await getIdeasByIds(ideaIds);
  const ideasMap = new Map(ideas.map((i) => [i.id, i]));
  return links.map((link) => ({
    ...link,
    idea: ideasMap.get(link.idea_id) ?? null,
  }));
}

/** List all ideas for the current user (e.g. for link-to-project picker). */
export async function listIdeasForPickerAction() {
  await requireAuth();
  return listIdeas();
}
