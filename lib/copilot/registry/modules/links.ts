import { captureWithContext } from '@/lib/sentry';
import {
  validateProjectLinkUrl,
  validateProjectLinkTitle,
  LINK_TYPES,
} from '@/lib/validation/project-links';
import type {
  LinkProposalPayload,
  DeleteLinkPayload,
  UpdateLinkPayload,
  CopilotLinkType,
} from '@/lib/copilot/schema';
import type {
  CopilotModuleCapability,
  ApproveContext,
  ApproveResult,
} from '@/lib/copilot/registry/types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

function isValidLinkType(value: unknown): value is CopilotLinkType {
  return (
    typeof value === 'string' &&
    (LINK_TYPES as readonly string[]).includes(value)
  );
}

// ─── Validators ───────────────────────────────────────────────────────────────

export function validateLinkShape(item: unknown): LinkProposalPayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;

  const title = validateProjectLinkTitle(obj.title);
  if (!title) return null;

  const url = validateProjectLinkUrl(obj.url);
  if (!url) return null;

  return {
    type: 'link',
    title,
    url,
    category_name:
      typeof obj.category_name === 'string' && obj.category_name.trim()
        ? obj.category_name.trim()
        : null,
    description:
      typeof obj.description === 'string' && obj.description.trim()
        ? obj.description.trim().slice(0, 1000)
        : null,
    link_type: isValidLinkType(obj.link_type) ? obj.link_type : 'reference',
  };
}

export function validateDeleteLinkShape(
  item: unknown
): DeleteLinkPayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (!isValidUuid(obj.entity_id)) return null;
  return {
    type: 'delete_link',
    entity_id: (obj.entity_id as string).trim(),
    entity_title:
      typeof obj.entity_title === 'string'
        ? obj.entity_title.trim()
        : undefined,
  };
}

export function validateUpdateLinkShape(
  item: unknown
): UpdateLinkPayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (!isValidUuid(obj.entity_id)) return null;

  const result: UpdateLinkPayload = {
    type: 'update_link',
    entity_id: (obj.entity_id as string).trim(),
    entity_title:
      typeof obj.entity_title === 'string'
        ? obj.entity_title.trim()
        : undefined,
  };

  const title = validateProjectLinkTitle(obj.title);
  if (title) result.title = title;

  const url = validateProjectLinkUrl(obj.url);
  if (url) result.url = url;

  if (obj.category_name !== undefined)
    result.category_name =
      typeof obj.category_name === 'string' && obj.category_name.trim()
        ? obj.category_name.trim()
        : null;

  if (obj.description !== undefined)
    result.description =
      typeof obj.description === 'string' && obj.description.trim()
        ? obj.description.trim().slice(0, 1000)
        : null;

  return result;
}

// ─── Category resolution helper ───────────────────────────────────────────────

/** Resolves a category name → category_id for this user. Returns null if not found. */
async function resolveCategoryId(
  categoryName: string | null | undefined,
  ctx: ApproveContext
): Promise<string | null> {
  if (!categoryName?.trim()) return null;

  const { data: categories } = await (ctx.supabase as any)
    .from('link_categories')
    .select('id, name')
    .eq('owner_id', ctx.userId);

  if (!Array.isArray(categories) || categories.length === 0) return null;

  const target = categoryName.trim().toLowerCase();
  const match = categories.find(
    (c: { id: string; name: string }) => c.name.trim().toLowerCase() === target
  );
  return match?.id ?? null;
}

// ─── Approve functions ────────────────────────────────────────────────────────

async function approveLink(
  payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const p = payload as LinkProposalPayload;

  const categoryId = await resolveCategoryId(p.category_name, ctx);

  const { data, error } = await (ctx.supabase as any)
    .from('project_links')
    .insert({
      project_id: ctx.projectId,
      owner_id: ctx.userId,
      title: p.title,
      url: p.url,
      description: p.description ?? null,
      link_type: p.link_type ?? 'reference',
      category_id: categoryId,
      open_in_new_tab: true,
      pinned: false,
    })
    .select('id')
    .single();

  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'approveLink',
      userIntent: 'Create link via copilot proposal',
      expected: 'Project link row inserted',
      extra: { projectId: ctx.projectId },
    });
    return { error: error.message };
  }
  return { entityId: (data as { id: string }).id };
}

async function approveDeleteLink(
  payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const p = payload as DeleteLinkPayload;
  const { error } = await (ctx.supabase as any)
    .from('project_links')
    .delete()
    .eq('id', p.entity_id)
    .eq('owner_id', ctx.userId);

  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'approveDeleteLink',
      userIntent: 'Delete link via copilot proposal',
      expected: 'Project link row deleted',
      extra: { entityId: p.entity_id },
    });
    return { error: error.message };
  }
  return { entityId: p.entity_id };
}

async function approveUpdateLink(
  payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const p = payload as UpdateLinkPayload;
  const updates: Record<string, unknown> = {};

  if (p.title) updates.title = p.title;
  if (p.url) updates.url = p.url;
  if (p.description !== undefined) updates.description = p.description;

  if (p.category_name !== undefined) {
    updates.category_id = await resolveCategoryId(p.category_name, ctx);
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await (ctx.supabase as any)
      .from('project_links')
      .update(updates)
      .eq('id', p.entity_id)
      .eq('owner_id', ctx.userId);

    if (error) {
      captureWithContext(error, {
        module: 'copilot',
        action: 'approveUpdateLink',
        userIntent: 'Update link via copilot proposal',
        expected: 'Project link fields updated',
        extra: { entityId: p.entity_id },
      });
      return { error: error.message };
    }
  }
  return { entityId: p.entity_id };
}

// ─── Context fetcher ──────────────────────────────────────────────────────────

/**
 * @param ownerFilter  null = project scope (no owner filter);
 *                     string[] = restrict to these owner IDs (own or team scope).
 *                     Resolved by buildProjectContext before this call.
 */
export async function fetchLinksContext(
  projectId: string,
  scope: 'standard' | 'full',
  supabase: any,
  ownerFilter: string[] | null
): Promise<string> {
  let linksQuery = supabase
    .from('project_links')
    .select('id, title, url, category_id, description')
    .eq('project_id', projectId)
    .is('archived_at', null)
    .order('pinned', { ascending: false })
    .order('sort_order', { ascending: true });

  if (ownerFilter !== null) {
    linksQuery =
      ownerFilter.length === 1
        ? linksQuery.eq('owner_id', ownerFilter[0])
        : linksQuery.in('owner_id', ownerFilter);
  }

  const [{ data: links }, { data: categories }] = await Promise.all([
    linksQuery,
    supabase
      .from('link_categories')
      .select('id, name')
      .order('sort_order', { ascending: true }),
  ]);

  const linkRows = (links ?? []) as {
    id: string;
    title: string;
    url: string;
    category_id: string | null;
  }[];
  const catRows = (categories ?? []) as { id: string; name: string }[];
  const catMap = new Map(catRows.map((c) => [c.id, c.name]));

  if (scope === 'full') {
    if (linkRows.length === 0) return '## Links\n- No links yet.';
    const lines = linkRows.map((l) => {
      const cat = l.category_id
        ? (catMap.get(l.category_id) ?? 'Uncategorized')
        : 'Uncategorized';
      return `- [${l.id}] ${l.title} — ${l.url} (${cat})`;
    });
    return `## Links (${linkRows.length} total — with ids for update/delete)\n\nLink format: [id] title — url (category)\n${lines.join('\n')}`;
  }

  // Standard: summary only
  const catNames = [
    ...new Set(
      linkRows
        .map((l) => (l.category_id ? catMap.get(l.category_id) : null))
        .filter(Boolean)
    ),
  ];
  const recentTitles = linkRows.slice(0, 6).map((l) => l.title);
  const parts: string[] = [`Links: ${linkRows.length} total`];
  if (catNames.length > 0) parts.push(`Categories: ${catNames.join(', ')}`);
  if (recentTitles.length > 0) parts.push(`Recent: ${recentTitles.join(', ')}`);
  return `## Links\n${parts.join('. ')}.`;
}

// ─── Capabilities ─────────────────────────────────────────────────────────────

export const linksCapabilities: CopilotModuleCapability[] = [
  {
    type: 'link',
    module: 'links',
    label: 'copilot.proposal_link',
    icon: 'Link2',
    cardVariant: 'create',
    requiredAction: 'links.create',
    promptDescription: 'Save a reference link in the project link vault',
    examplePayload: {
      type: 'link',
      title: 'Stripe Docs',
      url: 'https://stripe.com/docs',
      category_name: 'References',
      description: 'Payment API documentation',
      link_type: 'reference',
    },
    validate: validateLinkShape,
    approve: approveLink,
    revalidatePaths: (projectId) => ['/context', `/context/${projectId}/links`],
  },
  {
    type: 'delete_link',
    module: 'links',
    label: 'copilot.proposal_delete_link',
    icon: 'Trash2',
    cardVariant: 'delete',
    requiredAction: 'links.delete',
    promptDescription: 'Delete an existing link by its entity_id',
    examplePayload: {
      type: 'delete_link',
      entity_id: '<uuid>',
      entity_title: 'Link title',
    },
    validate: validateDeleteLinkShape,
    approve: approveDeleteLink,
    revalidatePaths: (projectId) => ['/context', `/context/${projectId}/links`],
  },
  {
    type: 'update_link',
    module: 'links',
    label: 'copilot.proposal_update_link',
    icon: 'Pencil',
    cardVariant: 'update',
    requiredAction: 'links.update',
    promptDescription:
      'Update title, url, or category of an existing link by its entity_id',
    examplePayload: {
      type: 'update_link',
      entity_id: '<uuid>',
      entity_title: 'Link title',
      category_name: 'Tools',
    },
    validate: validateUpdateLinkShape,
    approve: approveUpdateLink,
    revalidatePaths: (projectId) => ['/context', `/context/${projectId}/links`],
  },
];
