'use server';

import { requireAuth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import {
  linkIdeaToProject,
  unlinkIdeaFromProject,
} from '@/lib/idea-graph/project-links';

export async function linkIdeaToProjectAction(
  ideaId: string,
  projectId: string,
  role?: string | null
) {
  await requireAuth();

  if (!ideaId || ideaId.trim().length === 0) {
    return { error: 'Idea ID is required' };
  }

  if (!projectId || projectId.trim().length === 0) {
    return { error: 'Project ID is required' };
  }

  try {
    const data = await linkIdeaToProject({
      ideaId,
      projectId,
      role: role?.trim() || null,
    });

    // Revalidate both idea and project pages
    revalidatePath(`/ideas/${ideaId}`);
    revalidatePath(`/project/${projectId}`);
    return { data };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Failed to link idea to project',
    };
  }
}

export async function unlinkIdeaFromProjectAction(linkId: string) {
  await requireAuth();

  if (!linkId || linkId.trim().length === 0) {
    return { error: 'Link ID is required' };
  }

  try {
    await unlinkIdeaFromProject(linkId);
    // Revalidate both idea and project pages
    revalidatePath(`/ideas`);
    revalidatePath(`/project`);
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Failed to unlink idea from project',
    };
  }
}
