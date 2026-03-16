import type { createClient } from '@/lib/supabase/server';
import type { ParsedProposal } from '@/lib/copilot/schema';

export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface ApproveContext {
  proposalId: string;
  projectId: string;
  userId: string;
  supabase: SupabaseServerClient;
}

export interface ApproveResult {
  entityId?: string;
  error?: string;
}

export interface CopilotModuleCapability {
  /** Proposal type string (e.g. 'task', 'delete_task'). Must be unique across all modules. */
  type: string;
  /** Module group name (e.g. 'tasks', 'notes'). Used to deduplicate contextFetcher calls. */
  module: string;
  /** i18n key for the proposal type label shown in the UI. */
  label: string;
  /** Lucide icon name (string — avoids server/client boundary). */
  icon: string;
  /** Card visual variant — drives border color and button style. */
  cardVariant: 'create' | 'delete' | 'update' | 'graph';
  /**
   * RBAC action key that the user must hold to approve this proposal.
   * Checked in the dispatcher before calling `approve`. Uses `can()` from resolver.
   * Example: 'tasks.create', 'notes.delete', 'billings.update_description'.
   */
  requiredAction: string;
  /** One-line description included in the AI system prompt. */
  promptDescription: string;
  /** Canonical example payload shown to the AI in the system prompt. */
  examplePayload: object;
  /**
   * Fetches project-scoped context for this module to include in the system prompt.
   * Standard scope: summary counts + recent items (no IDs).
   * Full scope: all items with IDs so the AI can propose updates/deletes.
   */
  contextFetcher?: (
    projectId: string,
    scope: 'standard' | 'full'
  ) => Promise<string>;
  /** Validates a raw parsed JSON item and returns a typed payload or null if invalid. */
  validate: (item: unknown) => ParsedProposal | null;
  /**
   * Executes the proposal action server-side.
   * Must not be called from the client. The supabase client in ctx is already authenticated.
   * Returns { entityId } on success or { error } on failure.
   */
  approve: (payload: unknown, ctx: ApproveContext) => Promise<ApproveResult>;
  /**
   * Paths to revalidate after approval.
   * If omitted, the dispatcher uses the default set: board + notes + milestones.
   */
  revalidatePaths?: (projectId: string) => string[];
}
