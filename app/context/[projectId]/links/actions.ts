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
  normalizeTags,
} from '@/lib/validation/project-links';

const PROJECT_LINKS_SELECT =
  'id, project_id, owner_id, linked_task_id, category_id, title, description, url, provider, link_type, section, tags, pinned, sort_order, open_in_new_tab, archived_at, created_at, updated_at';

type ProjectLinkRow = Database['public']['Tables']['project_links']['Row'];
type ProjectLinkInsert =
  Database['public']['Tables']['project_links']['Insert'];
type ProjectLinkUpdate =
  Database['public']['Tables']['project_links']['Update'];
type LinkCategoryRow = Database['public']['Tables']['link_categories']['Row'];

const DEFAULT_CATEGORY_NAMES = [
  'Delivery',
  'Infrastructure',
  'Product',
  'Marketing',
  'Operations',
  'Client',
  'Other',
] as const;

export type ListProjectLinksParams = {
  category_id?: string;
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

    if (params?.category_id) {
      query = query.eq('category_id', params.category_id);
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

// ---------------------------------------------------------------------------
// Link categories (user-owned; seed defaults when empty)
// ---------------------------------------------------------------------------

export const listLinkCategoriesAction = cache(
  async (): Promise<LinkCategoryRow[]> => {
    const user = await requireAuth();
    const supabase = await createClient();

    const { data: existing, error: fetchError } = await supabase
      .from('link_categories')
      .select('id, owner_id, name, sort_order, created_at, updated_at')
      .eq('owner_id', user.id)
      .order('sort_order', { ascending: true });

    if (fetchError) {
      console.error('Error fetching link categories:', fetchError);
      return [];
    }

    if (existing && existing.length > 0) {
      return existing as LinkCategoryRow[];
    }

    for (let i = 0; i < DEFAULT_CATEGORY_NAMES.length; i++) {
      await supabase.from('link_categories').insert({
        owner_id: user.id,
        name: DEFAULT_CATEGORY_NAMES[i],
        sort_order: i,
      } as never);
    }

    const { data: seeded } = await supabase
      .from('link_categories')
      .select('id, owner_id, name, sort_order, created_at, updated_at')
      .eq('owner_id', user.id)
      .order('sort_order', { ascending: true });

    return (seeded as LinkCategoryRow[]) ?? [];
  }
);

export async function createLinkCategoryAction(
  name: string
): Promise<{ error?: string; data?: LinkCategoryRow }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const trimmed = name?.trim();
  if (!trimmed) return { error: 'Category name is required' };

  const { data: max } = await supabase
    .from('link_categories')
    .select('sort_order')
    .eq('owner_id', user.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const sort_order =
    ((max as { sort_order: number } | null)?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from('link_categories')
    .insert({ owner_id: user.id, name: trimmed, sort_order } as never)
    .select('id, owner_id, name, sort_order, created_at, updated_at')
    .single();

  if (error) return { error: error.message };
  return { data: data as LinkCategoryRow };
}

export async function updateLinkCategoryAction(
  categoryId: string,
  name: string
): Promise<{ error?: string; data?: LinkCategoryRow }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const trimmed = name?.trim();
  if (!trimmed) return { error: 'Category name is required' };

  const { data, error } = await supabase
    .from('link_categories')
    .update({ name: trimmed } as never)
    .eq('id', categoryId)
    .eq('owner_id', user.id)
    .select('id, owner_id, name, sort_order, created_at, updated_at')
    .single();

  if (error) return { error: error.message };
  return { data: data as LinkCategoryRow };
}

export async function deleteLinkCategoryAction(
  categoryId: string
): Promise<{ error?: string }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const { error: linksError } = await supabase
    .from('project_links')
    .delete()
    .eq('category_id', categoryId)
    .eq('owner_id', user.id);

  if (linksError) return { error: linksError.message };

  const { error: catError } = await supabase
    .from('link_categories')
    .delete()
    .eq('id', categoryId)
    .eq('owner_id', user.id);

  if (catError) return { error: catError.message };
  return {};
}

export type CreateProjectLinkInput = {
  title: string;
  url: string;
  description?: string | null;
  provider?: string | null;
  link_type: Database['public']['Enums']['project_link_type_enum'];
  category_id: string;
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

  const categoryId = input.category_id?.trim();
  if (!categoryId) return { error: 'Category is required' };

  const { data: cat } = await supabase
    .from('link_categories')
    .select('id')
    .eq('id', categoryId)
    .eq('owner_id', user.id)
    .single();
  if (!cat) return { error: 'Category not found or access denied' };

  const payload: ProjectLinkInsert = {
    project_id: pid,
    owner_id: user.id,
    category_id: categoryId,
    title,
    url,
    description: input.description?.trim() || null,
    provider: input.provider?.trim() || null,
    link_type: input.link_type,
    section: null,
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
  category_id?: string | null;
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
  if (input.category_id !== undefined) {
    if (input.category_id === null || input.category_id === '') {
      updates.category_id = null;
      updates.section = null;
    } else {
      const user = await requireAuth();
      const { data: cat } = await supabase
        .from('link_categories')
        .select('id')
        .eq('id', input.category_id)
        .eq('owner_id', user.id)
        .single();
      if (!cat) return { error: 'Category not found or access denied' };
      updates.category_id = input.category_id;
    }
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
