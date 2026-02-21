'use server';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { Database } from '@/lib/supabase/types';
import {
  validateProjectLinkUrl,
  validateProjectLinkTitle,
  isValidProjectLinkType,
  isValidProjectLinkSection,
  normalizeTags,
} from '@/lib/validation/project-links';

const PROJECT_LINKS_SELECT =
  'id, project_id, owner_id, linked_task_id, title, description, url, provider, link_type, section, tags, pinned, sort_order, open_in_new_tab, archived_at, created_at, updated_at';

type ProjectLinkRow = Database['public']['Tables']['project_links']['Row'];
type ProjectLinkInsert =
  Database['public']['Tables']['project_links']['Insert'];
type ProjectLinkUpdate =
  Database['public']['Tables']['project_links']['Update'];

export type ListProjectLinksParams = {
  section?: Database['public']['Enums']['project_link_section_enum'];
  includeArchived?: boolean;
};

export const listProjectLinksAction = cache(
  async (
    projectId: string,
    params?: ListProjectLinksParams
  ): Promise<ProjectLinkRow[]> => {
    const user = await requireAuth();
    const supabase = await createClient();

    const pid = projectId?.trim();
    if (!pid) return [];

    let query = supabase
      .from('project_links')
      .select(PROJECT_LINKS_SELECT)
      .eq('project_id', pid)
      .eq('owner_id', user.id)
      .order('pinned', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (params?.section) {
      query = query.eq('section', params.section);
    }
    if (params?.includeArchived !== true) {
      query = query.is('archived_at', null);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching project links:', error);
      return [];
    }
    return (data as ProjectLinkRow[]) ?? [];
  }
);

export type CreateProjectLinkInput = {
  title: string;
  url: string;
  description?: string | null;
  provider?: string | null;
  link_type: Database['public']['Enums']['project_link_type_enum'];
  section: Database['public']['Enums']['project_link_section_enum'];
  tags?: string[];
  pinned?: boolean;
  open_in_new_tab?: boolean;
};

export async function createProjectLinkAction(
  projectId: string,
  input: CreateProjectLinkInput
): Promise<{ error?: string; data?: ProjectLinkRow }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const pid = projectId?.trim();
  if (!pid) return { error: 'Project is required' };

  const title = validateProjectLinkTitle(input.title);
  if (!title) return { error: 'Title is required' };

  const url = validateProjectLinkUrl(input.url);
  if (!url)
    return { error: 'URL is required and must start with http:// or https://' };

  if (!isValidProjectLinkType(input.link_type)) {
    return { error: 'Invalid link type' };
  }
  if (!isValidProjectLinkSection(input.section)) {
    return { error: 'Invalid section' };
  }

  const payload: ProjectLinkInsert = {
    project_id: pid,
    owner_id: user.id,
    title,
    url,
    description: input.description?.trim() || null,
    provider: input.provider?.trim() || null,
    link_type: input.link_type,
    section: input.section,
    tags: normalizeTags(input.tags),
    pinned: input.pinned ?? false,
    open_in_new_tab: input.open_in_new_tab ?? true,
  };

  const { data, error } = await supabase
    .from('project_links')
    .insert(payload as never)
    .select(PROJECT_LINKS_SELECT)
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/context');
  revalidatePath(`/context/${pid}`);
  revalidatePath(`/context/${pid}/links`);
  return { data: data as ProjectLinkRow };
}

export type UpdateProjectLinkInput = {
  title?: string;
  url?: string;
  description?: string | null;
  provider?: string | null;
  link_type?: Database['public']['Enums']['project_link_type_enum'];
  section?: Database['public']['Enums']['project_link_section_enum'];
  tags?: string[];
  pinned?: boolean;
  open_in_new_tab?: boolean;
  archived_at?: string | null;
};

export async function updateProjectLinkAction(
  linkId: string,
  input: UpdateProjectLinkInput
): Promise<{ error?: string; data?: ProjectLinkRow }> {
  await requireAuth();
  const supabase = await createClient();

  const id = linkId?.trim();
  if (!id) return { error: 'Link ID is required' };

  const updates: ProjectLinkUpdate = {};

  if (input.title !== undefined) {
    const title = validateProjectLinkTitle(input.title);
    if (!title) return { error: 'Title is required' };
    updates.title = title;
  }
  if (input.url !== undefined) {
    const url = validateProjectLinkUrl(input.url);
    if (!url)
      return {
        error: 'URL is required and must start with http:// or https://',
      };
    updates.url = url;
  }
  if (input.description !== undefined)
    updates.description = input.description?.trim() || null;
  if (input.provider !== undefined)
    updates.provider = input.provider?.trim() || null;
  if (input.link_type !== undefined) {
    if (!isValidProjectLinkType(input.link_type))
      return { error: 'Invalid link type' };
    updates.link_type = input.link_type;
  }
  if (input.section !== undefined) {
    if (!isValidProjectLinkSection(input.section))
      return { error: 'Invalid section' };
    updates.section = input.section;
  }
  if (input.tags !== undefined) updates.tags = normalizeTags(input.tags);
  if (input.pinned !== undefined) updates.pinned = input.pinned;
  if (input.open_in_new_tab !== undefined)
    updates.open_in_new_tab = input.open_in_new_tab;
  if (input.archived_at !== undefined) updates.archived_at = input.archived_at;

  if (Object.keys(updates).length === 0) {
    const { data: existing } = await supabase
      .from('project_links')
      .select(PROJECT_LINKS_SELECT)
      .eq('id', id)
      .single();
    return existing
      ? { data: existing as ProjectLinkRow }
      : { error: 'Link not found' };
  }

  const { data, error } = await supabase
    .from('project_links')
    .update(updates as never)
    .eq('id', id)
    .select(PROJECT_LINKS_SELECT)
    .single();

  if (error) return { error: error.message };

  const projectId = (data as ProjectLinkRow).project_id;
  revalidatePath('/context');
  revalidatePath(`/context/${projectId}`);
  revalidatePath(`/context/${projectId}/links`);
  return { data: data as ProjectLinkRow };
}

export async function archiveProjectLinkAction(
  linkId: string
): Promise<{ error?: string; data?: ProjectLinkRow }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const id = linkId?.trim();
  if (!id) return { error: 'Link ID is required' };

  const { data: link, error: fetchError } = await supabase
    .from('project_links')
    .select('id, project_id, owner_id')
    .eq('id', id)
    .eq('owner_id', user.id)
    .single();

  if (fetchError || !link) {
    return { error: 'Link not found or access denied' };
  }

  const { data, error } = await supabase
    .from('project_links')
    .update({ archived_at: new Date().toISOString() } as never)
    .eq('id', id)
    .select(PROJECT_LINKS_SELECT)
    .single();

  if (error) return { error: error.message };

  const projectId = (data as ProjectLinkRow).project_id;
  revalidatePath('/context');
  revalidatePath(`/context/${projectId}`);
  revalidatePath(`/context/${projectId}/links`);
  return { data: data as ProjectLinkRow };
}

export async function reorderProjectLinksAction(
  projectId: string,
  orderedIds: string[]
): Promise<{ error?: string }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const pid = projectId?.trim();
  if (!pid || !Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { error: 'Project and ordered link IDs are required' };
  }

  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i]?.trim();
    if (!id) continue;
    const { error } = await supabase
      .from('project_links')
      .update({ sort_order: i } as never)
      .eq('id', id)
      .eq('project_id', pid)
      .eq('owner_id', user.id);
    if (error) return { error: error.message };
  }

  revalidatePath('/context');
  revalidatePath(`/context/${pid}`);
  revalidatePath(`/context/${pid}/links`);
  return {};
}
