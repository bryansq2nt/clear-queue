import { captureWithContext } from '@/lib/sentry';
import type {
  MindMapProposalPayload,
  MindMapNode,
  MindMapEdge,
} from '@/lib/copilot/schema';
import type {
  CopilotModuleCapability,
  ApproveContext,
  ApproveResult,
} from '@/lib/copilot/registry/types';

// Max nodes allowed per mind map proposal to prevent runaway payloads
const MAX_MIND_MAP_NODES = 20;

// ─── Validator ────────────────────────────────────────────────────────────────

export function validateMindMapShape(
  item: unknown
): MindMapProposalPayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;

  if (typeof obj.board_name !== 'string' || !obj.board_name.trim()) return null;
  if (!Array.isArray(obj.nodes) || obj.nodes.length === 0) return null;
  if (!Array.isArray(obj.edges)) return null;

  // Validate and collect nodes
  const nodes: MindMapNode[] = [];
  const tempIds = new Set<string>();
  for (const n of obj.nodes.slice(0, MAX_MIND_MAP_NODES)) {
    if (!n || typeof n !== 'object') continue;
    const node = n as Record<string, unknown>;
    if (typeof node.temp_id !== 'string' || !node.temp_id.trim()) continue;
    if (typeof node.title !== 'string' || !node.title.trim()) continue;
    const tempId = node.temp_id.trim();
    if (tempIds.has(tempId)) continue; // skip duplicate temp_ids
    tempIds.add(tempId);
    nodes.push({
      temp_id: tempId,
      title: node.title.trim().slice(0, 200),
      description:
        typeof node.description === 'string' && node.description.trim()
          ? node.description.trim().slice(0, 2000)
          : null,
      x: typeof node.x === 'number' ? node.x : undefined,
      y: typeof node.y === 'number' ? node.y : undefined,
    });
  }
  if (nodes.length === 0) return null;

  // Validate edges — both temp_ids must exist in nodes
  const edges: MindMapEdge[] = [];
  for (const e of obj.edges) {
    if (!e || typeof e !== 'object') continue;
    const edge = e as Record<string, unknown>;
    if (typeof edge.from !== 'string' || typeof edge.to !== 'string') continue;
    const from = edge.from.trim();
    const to = edge.to.trim();
    if (!tempIds.has(from) || !tempIds.has(to)) continue; // skip invalid refs
    if (from === to) continue; // no self-loops
    const connectionType =
      typeof edge.type === 'string' && edge.type.trim()
        ? edge.type.trim()
        : 'relates_to';
    edges.push({ from, to, type: connectionType });
  }

  return {
    type: 'mind_map',
    board_name: obj.board_name.trim().slice(0, 200),
    board_description:
      typeof obj.board_description === 'string' && obj.board_description.trim()
        ? obj.board_description.trim().slice(0, 2000)
        : null,
    nodes,
    edges,
  };
}

// ─── Approve function ─────────────────────────────────────────────────────────

/**
 * Creates an idea board with all nodes (ideas), board items, and connections
 * from an approved mind_map proposal.
 *
 * Steps:
 * 1. Insert idea_boards row (with project_id)
 * 2. Batch-insert all ideas rows
 * 3. Build temp_id → real idea_id map
 * 4. Batch-insert idea_board_items (board_id + idea_id + x/y)
 * 5. Insert idea_connections (from/to real idea ids)
 *
 * Not atomic — if a later step fails the board and its ideas may already exist.
 * The board is still usable and the user can edit it in the Ideas tab.
 */
async function approveMindMap(
  payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const p = payload as MindMapProposalPayload;

  if (!p.board_name?.trim())
    return { error: 'Mind map proposal is missing board_name' };
  if (!Array.isArray(p.nodes) || p.nodes.length === 0)
    return { error: 'Mind map proposal has no nodes' };

  // 1. Create the board
  const { data: boardData, error: boardError } = await (ctx.supabase as any)
    .from('idea_boards')
    .insert({
      owner_id: ctx.userId,
      name: p.board_name.trim(),
      description: p.board_description?.trim() || null,
      project_id: ctx.projectId,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (boardError || !boardData?.id) {
    return { error: boardError?.message ?? 'Failed to create idea board' };
  }
  const boardId: string = boardData.id;

  // 2. Batch-insert ideas
  const ideaRows = p.nodes.map((n) => ({
    owner_id: ctx.userId,
    title: n.title.trim(),
    description: n.description?.trim() || null,
    updated_at: new Date().toISOString(),
  }));

  const { data: ideaData, error: ideaError } = await (ctx.supabase as any)
    .from('ideas')
    .insert(ideaRows)
    .select('id');

  if (ideaError || !Array.isArray(ideaData) || ideaData.length === 0) {
    return { error: ideaError?.message ?? 'Failed to create ideas' };
  }

  // 3. Map temp_id → real idea id (preserve insertion order)
  const tempIdToIdeaId = new Map<string, string>();
  p.nodes.forEach((n, i) => {
    const realId = (ideaData[i] as { id: string } | undefined)?.id;
    if (realId) tempIdToIdeaId.set(n.temp_id, realId);
  });

  // Default radial layout: if no x/y, spread nodes evenly in a circle
  const defaultPositions = (index: number, total: number) => {
    if (total <= 1) return { x: 0, y: 0 };
    if (index === 0) return { x: 0, y: 0 }; // center
    const angle = ((index - 1) / (total - 1)) * 2 * Math.PI;
    return {
      x: Math.round(300 * Math.cos(angle)),
      y: Math.round(200 * Math.sin(angle)),
    };
  };

  // 4. Batch-insert idea_board_items
  const boardItemRows = p.nodes
    .map((n, i) => {
      const ideaId = tempIdToIdeaId.get(n.temp_id);
      if (!ideaId) return null;
      const pos =
        n.x !== undefined && n.y !== undefined
          ? { x: n.x, y: n.y }
          : defaultPositions(i, p.nodes.length);
      return {
        owner_id: ctx.userId,
        board_id: boardId,
        idea_id: ideaId,
        x: pos.x,
        y: pos.y,
        updated_at: new Date().toISOString(),
      };
    })
    .filter(Boolean);

  if (boardItemRows.length > 0) {
    const { error: itemsError } = await (ctx.supabase as any)
      .from('idea_board_items')
      .insert(boardItemRows);

    if (itemsError) {
      captureWithContext(itemsError, {
        module: 'copilot',
        action: 'approveMindMap',
        userIntent: 'Create idea board items from mind_map proposal',
        expected: 'Board items created for each node',
        extra: { boardId, projectId: ctx.projectId },
      });
      // Board and ideas exist — still return boardId
    }
  }

  // 5. Insert idea_connections
  const connectionRows = p.edges
    .map((e) => {
      const fromId = tempIdToIdeaId.get(e.from);
      const toId = tempIdToIdeaId.get(e.to);
      if (!fromId || !toId || fromId === toId) return null;
      return {
        owner_id: ctx.userId,
        from_idea_id: fromId,
        to_idea_id: toId,
        type: e.type || 'relates_to',
      };
    })
    .filter(Boolean);

  if (connectionRows.length > 0) {
    const { error: connError } = await (ctx.supabase as any)
      .from('idea_connections')
      .insert(connectionRows);

    if (connError) {
      captureWithContext(connError, {
        module: 'copilot',
        action: 'approveMindMap',
        userIntent: 'Create idea connections from mind_map proposal',
        expected: 'Connections created between ideas',
        extra: { boardId, projectId: ctx.projectId },
      });
      // Connections failed — still return boardId
    }
  }

  return { entityId: boardId };
}

// ─── Capabilities ─────────────────────────────────────────────────────────────

export const ideasCapabilities: CopilotModuleCapability[] = [
  {
    type: 'mind_map',
    module: 'ideas',
    label: 'copilot.proposal_mind_map',
    icon: 'GitFork',
    cardVariant: 'graph',
    promptDescription:
      'Create an idea board (mind map) with nodes and connections',
    examplePayload: {
      type: 'mind_map',
      board_name: 'Project Roadmap',
      board_description: 'High-level feature roadmap',
      nodes: [
        { temp_id: 'n1', title: 'Auth', description: 'Login and signup' },
        { temp_id: 'n2', title: 'Dashboard' },
        { temp_id: 'n3', title: 'Payments' },
      ],
      edges: [
        { from: 'n1', to: 'n2', type: 'leads_to' },
        { from: 'n2', to: 'n3', type: 'includes' },
      ],
    },
    validate: validateMindMapShape,
    approve: approveMindMap,
    revalidatePaths: (projectId) => [
      '/dashboard',
      '/context',
      `/context/${projectId}/ideas`,
    ],
  },
];
