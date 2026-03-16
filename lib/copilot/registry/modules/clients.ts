import { captureWithContext } from '@/lib/sentry';
import type { ClientProposalPayload } from '@/lib/copilot/schema';
import type {
  CopilotModuleCapability,
  ApproveContext,
  ApproveResult,
} from '@/lib/copilot/registry/types';

// ─── Context fetcher ──────────────────────────────────────────────────────────

export async function fetchClientsContext(
  projectId: string,
  scope: 'standard' | 'full',
  supabase: any,
  _ownerFilter: string[] | null
): Promise<string> {
  // Fetch project's linked client and business
  const { data: project } = await supabase
    .from('projects')
    .select('client_id, business_id')
    .eq('id', projectId)
    .single();

  if (!project?.client_id && !project?.business_id) {
    return '## Project Owner / Responsible\n- No client or business linked to this project.';
  }

  const parts: string[] = [];

  if (project.client_id) {
    const { data: client } = await supabase
      .from('clients')
      .select('id, full_name, email, phone')
      .eq('id', project.client_id)
      .single();

    if (client) {
      const idPart = scope === 'full' ? ` [${client.id}]` : '';
      parts.push(
        `- Client${idPart}: ${client.full_name}${client.email ? ` <${client.email}>` : ''}${client.phone ? ` · ${client.phone}` : ''}`
      );
    }
  }

  if (project.business_id) {
    const { data: business } = await supabase
      .from('businesses')
      .select('id, name')
      .eq('id', project.business_id)
      .single();

    if (business) {
      parts.push(`- Business: ${business.name}`);
    }
  }

  return `## Project Owner / Responsible\n${parts.join('\n')}`;
}

// ─── Validators ───────────────────────────────────────────────────────────────

export function validateClientShape(
  item: unknown
): ClientProposalPayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (typeof obj.full_name !== 'string' || !obj.full_name.trim()) return null;
  return {
    type: 'client',
    full_name: obj.full_name.trim(),
    email: typeof obj.email === 'string' ? obj.email.trim() || null : null,
    phone: typeof obj.phone === 'string' ? obj.phone.trim() || null : null,
    notes: typeof obj.notes === 'string' ? obj.notes.trim() || null : null,
  };
}

// ─── Approve functions ────────────────────────────────────────────────────────

async function approveClient(
  payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const p = payload as ClientProposalPayload;
  const { data, error } = await (ctx.supabase as any)
    .from('clients')
    .insert({
      owner_id: ctx.userId,
      full_name: p.full_name,
      email: p.email ?? null,
      phone: p.phone ?? null,
      notes: p.notes ?? null,
    })
    .select('id')
    .single();

  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'approveClient',
      userIntent: 'Create a client via copilot proposal',
      expected: 'Client row inserted',
      extra: { projectId: ctx.projectId },
    });
    return { error: error.message };
  }
  return { entityId: (data as { id: string }).id };
}

// ─── Capabilities ─────────────────────────────────────────────────────────────

export const clientsCapabilities: CopilotModuleCapability[] = [
  {
    type: 'client',
    module: 'clients',
    label: 'copilot.proposal_client',
    icon: 'User',
    cardVariant: 'create',
    requiredAction: 'owner.create_client',
    promptDescription: 'Create a new client contact',
    examplePayload: {
      type: 'client',
      full_name: 'María González',
      email: 'maria@example.com',
      phone: '+1-555-0100',
    },
    validate: validateClientShape,
    approve: approveClient,
    revalidatePaths: () => ['/clients', '/context'],
  },
];
