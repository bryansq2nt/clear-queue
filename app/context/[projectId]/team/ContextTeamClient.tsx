'use client';

import { useState, useCallback, useMemo } from 'react';
import { useI18n } from '@/components/shared/I18nProvider';
import {
  inviteProjectMember,
  createInviteRole,
  revokeInvite,
  removeProjectMember,
} from '@/app/actions/teams';
import type {
  ProjectMember,
  ProjectInvite,
  ProjectAccessProfile,
  InviteRole,
} from '@/app/actions/teams';
import {
  Users,
  UserMinus,
  Copy,
  Check,
  X,
  Mail,
  Clock,
  Plus,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Shield,
} from 'lucide-react';
import { MutationErrorDialog } from '@/components/board/MutationErrorDialog';

// ── Module catalogue (all 12 modules) ────────────────────────────────────────

const ALL_MODULES: Array<{ key: string; label: string }> = [
  { key: 'board', label: 'Tasks' },
  { key: 'notes', label: 'Notes' },
  { key: 'documents', label: 'Documents' },
  { key: 'media', label: 'Media' },
  { key: 'links', label: 'Links' },
  { key: 'milestones', label: 'Milestones' },
  { key: 'budgets', label: 'Budgets' },
  { key: 'billings', label: 'Billing' },
  { key: 'ideas', label: 'Ideas' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'todos', label: 'Todos' },
  { key: 'copilot', label: 'Copilot' },
];

// ── Permission catalogue per module ──────────────────────────────────────────
// Keys are canonical action keys from rbac_module_actions.

const MODULE_PERMISSIONS: Record<
  string,
  Array<{ key: string; label: string }>
> = {
  board: [
    { key: 'tasks.read', label: 'View tasks' },
    { key: 'tasks.create', label: 'Create tasks' },
    { key: 'tasks.update_status', label: 'Move between columns' },
    { key: 'tasks.update_title', label: 'Edit task title' },
    { key: 'tasks.update_notes', label: 'Edit task description' },
    { key: 'tasks.update_priority', label: 'Change priority' },
    { key: 'tasks.update_due_date', label: 'Set due date' },
    { key: 'tasks.assign', label: 'Assign to team members' },
    { key: 'tasks.unassign', label: 'Remove assignments' },
    { key: 'tasks.delete', label: 'Delete tasks' },
  ],
  notes: [
    { key: 'notes.read', label: 'View notes' },
    { key: 'notes.create', label: 'Create notes' },
    { key: 'notes.update_title', label: 'Edit title' },
    { key: 'notes.update_content', label: 'Edit content' },
    { key: 'notes.delete', label: 'Delete notes' },
  ],
  documents: [
    { key: 'documents.read', label: 'View documents' },
    { key: 'documents.upload', label: 'Upload files' },
    { key: 'documents.download', label: 'Download files' },
    { key: 'documents.update_metadata', label: 'Edit document details' },
    { key: 'documents.delete', label: 'Delete documents' },
  ],
  media: [
    { key: 'media.read', label: 'View media' },
    { key: 'media.upload', label: 'Upload media' },
    { key: 'media.update_metadata', label: 'Edit media details' },
    { key: 'media.delete', label: 'Delete media' },
  ],
  links: [
    { key: 'links.read', label: 'View links' },
    { key: 'links.create', label: 'Add links' },
    { key: 'links.update', label: 'Edit links' },
    { key: 'links.delete', label: 'Delete links' },
  ],
  milestones: [
    { key: 'milestones.read', label: 'View milestones' },
    { key: 'milestones.create', label: 'Create milestones' },
    { key: 'milestones.update', label: 'Edit milestones' },
    { key: 'milestones.complete', label: 'Mark as complete' },
    { key: 'milestones.delete', label: 'Delete milestones' },
  ],
  budgets: [
    { key: 'budgets.read', label: 'View budgets' },
    { key: 'budgets.create', label: 'Create budgets' },
    { key: 'budgets.update', label: 'Edit budgets' },
    { key: 'budgets.manage_items', label: 'Manage line items' },
    { key: 'budgets.delete', label: 'Delete budgets' },
  ],
  billings: [
    { key: 'billings.read', label: 'View billing records' },
    { key: 'billings.create', label: 'Create billing records' },
    { key: 'billings.update_amount', label: 'Edit amount' },
    { key: 'billings.update_status', label: 'Change payment status' },
    { key: 'billings.update_description', label: 'Edit description' },
    { key: 'billings.delete', label: 'Delete billing records' },
  ],
  ideas: [
    { key: 'ideas.read', label: 'View mind maps' },
    { key: 'ideas.create_board', label: 'Create mind maps' },
    { key: 'ideas.update_board', label: 'Edit mind map settings' },
    { key: 'ideas.create_node', label: 'Add nodes' },
    { key: 'ideas.update_node', label: 'Edit nodes' },
    { key: 'ideas.delete_node', label: 'Delete nodes' },
    { key: 'ideas.delete_board', label: 'Delete mind maps' },
  ],
  calendar: [
    { key: 'calendar.read', label: 'View events' },
    { key: 'calendar.create', label: 'Create events' },
    { key: 'calendar.update', label: 'Edit events' },
    { key: 'calendar.delete', label: 'Delete events' },
  ],
  todos: [
    { key: 'todos.read', label: 'View todo lists' },
    { key: 'todos.create_list', label: 'Create lists' },
    { key: 'todos.create_item', label: 'Add items' },
    { key: 'todos.update_item', label: 'Edit items' },
    { key: 'todos.toggle_item', label: 'Check / uncheck items' },
    { key: 'todos.delete_item', label: 'Delete items' },
  ],
  copilot: [
    { key: 'copilot.read_sessions', label: 'View sessions' },
    { key: 'copilot.create_session', label: 'Start sessions' },
    { key: 'copilot.read_proposals', label: 'View proposals' },
    { key: 'copilot.approve_proposal', label: 'Approve proposals' },
    { key: 'copilot.reject_proposal', label: 'Reject proposals' },
  ],
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function roleLabel(name: string): string {
  const map: Record<string, string> = {
    project_owner: 'Owner',
    project_editor: 'Editor',
    project_viewer: 'Viewer',
  };
  return map[name] ?? name;
}

function roleBadgeClass(name: string): string {
  const map: Record<string, string> = {
    project_owner: 'bg-primary/15 text-primary',
    project_editor: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    project_viewer: 'bg-muted text-muted-foreground',
  };
  return map[name] ?? 'bg-muted text-muted-foreground';
}

// Returns the "richest" effective role name given a set of granted action keys.
function summarizeRole(
  grantedActions: string[]
): 'project_owner' | 'project_editor' | 'project_viewer' {
  const OWNER_ONLY = new Set([
    'tasks.bulk_delete',
    'notes.bulk_delete',
    'documents.bulk_delete',
    'documents.mark_final',
    'media.share_create',
    'copilot.bulk_approve',
    'copilot.bulk_reject',
    'projects.update',
    'projects.archive',
    'projects.unarchive',
    'projects.delete',
    'projects.link_client',
    'projects.toggle_module',
    'teams.invite_project_member',
    'teams.remove_project_member',
    'teams.update_project_member_roles',
  ]);
  const VIEWER_ONLY = new Set([
    'tasks.read',
    'milestones.read',
    'notes.read',
    'documents.read',
    'media.read',
    'calendar.read',
    'links.read',
    'ideas.read',
    'budgets.read',
    'billings.read',
    'todos.read',
    'copilot.read_sessions',
    'copilot.read_proposals',
    'projects.read',
    'profile.read',
    'workspace.read',
    'teams.read_project_members',
  ]);
  if (grantedActions.some((a) => OWNER_ONLY.has(a))) return 'project_owner';
  if (grantedActions.some((a) => !VIEWER_ONLY.has(a))) return 'project_editor';
  return 'project_viewer';
}

// ── Module card with inline permission checklist ──────────────────────────────

function ModuleCard({
  moduleKey,
  label,
  isSelected,
  isExpanded,
  selectedPermissions,
  onToggleModule,
  onTogglePermission,
}: {
  moduleKey: string;
  label: string;
  isSelected: boolean;
  isExpanded: boolean;
  selectedPermissions: string[];
  onToggleModule: () => void;
  onTogglePermission: (key: string) => void;
}) {
  const perms = MODULE_PERMISSIONS[moduleKey] ?? [];
  const selectedSet = new Set(selectedPermissions);
  const grantedCount = selectedPermissions.length;

  return (
    <div
      className={`rounded-lg border transition-colors ${
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-border bg-background'
      }`}
    >
      {/* Module header — click to toggle selection */}
      <button
        type="button"
        onClick={onToggleModule}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
      >
        <div className="flex items-center gap-2">
          <span
            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
              isSelected
                ? 'bg-primary border-primary'
                : 'border-muted-foreground/40'
            }`}
          >
            {isSelected && (
              <Check className="w-2.5 h-2.5 text-primary-foreground" />
            )}
          </span>
          <span
            className={`text-sm font-medium ${
              isSelected ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            {label}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {isSelected && (
            <span className="text-xs text-muted-foreground">
              {grantedCount}/{perms.length}
            </span>
          )}
          {isSelected &&
            (isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            ))}
        </div>
      </button>

      {/* Permission checklist — shown when expanded */}
      {isSelected && isExpanded && (
        <div className="px-3 pb-3 border-t border-border/60 pt-2 space-y-1">
          {perms.map(({ key, label: permLabel }) => (
            <button
              key={key}
              type="button"
              onClick={() => onTogglePermission(key)}
              className="w-full flex items-center gap-2 py-1 text-left hover:bg-accent/40 rounded px-1 transition-colors"
            >
              <span
                className={`w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center ${
                  selectedSet.has(key)
                    ? 'bg-primary border-primary'
                    : 'border-muted-foreground/40'
                }`}
              >
                {selectedSet.has(key) && (
                  <Check className="w-2 h-2 text-primary-foreground" />
                )}
              </span>
              <span
                className={`text-xs ${
                  selectedSet.has(key)
                    ? 'text-foreground'
                    : 'text-muted-foreground'
                }`}
              >
                {permLabel}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type InviteStep = 'email' | 'mode' | 'modules' | 'review';

interface Props {
  projectId: string;
  initialMembers: ProjectMember[];
  initialInvites: ProjectInvite[];
  roles: Array<{ id: string; name: string; description: string | null }>;
  profiles: ProjectAccessProfile[];
  reusableRoles: InviteRole[];
  onRefresh: () => void;
}

export default function ContextTeamClient({
  projectId,
  initialMembers,
  initialInvites,
  reusableRoles,
  onRefresh,
}: Props) {
  const { t } = useI18n();
  const [members] = useState<ProjectMember[]>(initialMembers);
  const [invites] = useState<ProjectInvite[]>(initialInvites);

  // ── Invite form state ─────────────────────────────────────────────
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [step, setStep] = useState<InviteStep>('email');
  const [inviteEmail, setInviteEmail] = useState('');

  // Mode: 'saved' = use existing role; 'custom' = build from scratch
  const [mode, setMode] = useState<'saved' | 'custom'>('custom');
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

  // Custom builder state
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  // granted permissions per module: Record<moduleKey, actionKey[]>
  const [modulePermissions, setModulePermissions] = useState<
    Record<string, string[]>
  >({});

  // Review step: optionally save as reusable role
  const [saveAsRole, setSaveAsRole] = useState(false);
  const [roleName, setRoleName] = useState('');

  // UI feedback
  const [inviteSaving, setInviteSaving] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [errorDialog, setErrorDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    retry: () => void;
  } | null>(null);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  // Flat list of all granted action keys (custom flow)
  const allGrantedActions = useMemo(
    () => selectedModules.flatMap((m) => modulePermissions[m] ?? []),
    [selectedModules, modulePermissions]
  );

  const effectiveRole = useMemo(
    () => summarizeRole(allGrantedActions),
    [allGrantedActions]
  );

  const handleCopyLink = useCallback((link: string) => {
    void navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  const resetForm = useCallback(() => {
    setStep('email');
    setInviteEmail('');
    setMode('custom');
    setSelectedRoleId(null);
    setSelectedModules([]);
    setExpandedModule(null);
    setModulePermissions({});
    setSaveAsRole(false);
    setRoleName('');
  }, []);

  const handleToggleForm = useCallback(() => {
    if (showInviteForm) resetForm();
    setShowInviteForm((v) => !v);
    setGeneratedLink(null);
  }, [showInviteForm, resetForm]);

  const handleToggleModule = useCallback((moduleKey: string) => {
    setSelectedModules((prev) => {
      if (prev.includes(moduleKey)) {
        // Deselect: also clear its permissions and collapse
        setModulePermissions((mp) => {
          const next = { ...mp };
          delete next[moduleKey];
          return next;
        });
        setExpandedModule((em) => (em === moduleKey ? null : em));
        return prev.filter((k) => k !== moduleKey);
      }
      // Select: expand it for permission configuration
      setExpandedModule(moduleKey);
      return [...prev, moduleKey];
    });
  }, []);

  const handleExpandModule = useCallback((moduleKey: string) => {
    setExpandedModule((prev) => (prev === moduleKey ? null : moduleKey));
  }, []);

  const handleTogglePermission = useCallback(
    (moduleKey: string, actionKey: string) => {
      setModulePermissions((prev) => {
        const current = prev[moduleKey] ?? [];
        const next = current.includes(actionKey)
          ? current.filter((k) => k !== actionKey)
          : [...current, actionKey];
        return { ...prev, [moduleKey]: next };
      });
    },
    []
  );

  const handleInvite = useCallback(async () => {
    setInviteSaving(true);

    let inviteRoleId: string | undefined;
    // For the saved-role mode, we need a fallback roleId for the invites table.
    // We use the effective_role_name from the selected saved role.
    let roleId = '';

    if (mode === 'saved' && selectedRoleId) {
      const savedRole = reusableRoles.find((r) => r.id === selectedRoleId);
      inviteRoleId = selectedRoleId;
      // The role_id column still needs a value; use a placeholder viewer role.
      // accept_invite_atomic will override it with effective_role_name from invite_roles.
      // We pass empty string here and let the RPC handle role assignment.
      // However the insert requires role_id NOT NULL, so we need to pass something valid.
      // We'll derive from effective_role_name.
      roleId = savedRole?.effective_role_name ?? 'project_viewer';
    } else {
      // Custom: create the invite role first
      const roleResult = await createInviteRole(projectId, {
        grantedActions: allGrantedActions,
        name: saveAsRole && roleName.trim() ? roleName.trim() : undefined,
      });
      if (roleResult.error) {
        setInviteSaving(false);
        setErrorDialog({
          open: true,
          title: t('teams.invite_error_title'),
          message: roleResult.error,
          retry: handleInvite,
        });
        return;
      }
      inviteRoleId = roleResult.data?.id;
      roleId = effectiveRole; // effective role name — used as fallback role_id lookup
    }

    // Resolve the actual role UUID for the role_id column
    // We pass the role name; the server action needs the UUID.
    // Since inviteProjectMember needs a roleId UUID, not name, we need to get it.
    // For now we store the effective_role_name in the invite_roles row and the RPC
    // resolves it. The role_id column in project_invites still needs a valid UUID.
    // We'll use a sentinel approach: find the matching system role UUID via a lookup.
    // This is handled server-side in inviteProjectMember via a new lookup path.
    // For now, pass the effective role name as roleId and handle in the action.
    // TODO: resolve via getSystemRoleId helper.
    // For the current implementation, we pass the role name and the action
    // will look up the UUID.

    const result = await inviteProjectMember(
      projectId,
      inviteEmail.trim(),
      roleId, // effective role name; action resolves to UUID
      undefined, // profileId (old path)
      inviteRoleId
    );
    setInviteSaving(false);

    if (result.error) {
      setErrorDialog({
        open: true,
        title: t('teams.invite_error_title'),
        message: result.error,
        retry: handleInvite,
      });
      return;
    }
    if (result.token) {
      setGeneratedLink(`${baseUrl}/invite/${result.token}`);
      resetForm();
      setShowInviteForm(false);
      onRefresh();
    }
  }, [
    mode,
    selectedRoleId,
    reusableRoles,
    allGrantedActions,
    saveAsRole,
    roleName,
    effectiveRole,
    projectId,
    inviteEmail,
    baseUrl,
    onRefresh,
    t,
    resetForm,
  ]);

  const handleRevoke = useCallback(
    async (inviteId: string) => {
      const result = await revokeInvite(inviteId, projectId);
      if (result.error) {
        setErrorDialog({
          open: true,
          title: t('teams.revoke_error_title'),
          message: result.error,
          retry: () => handleRevoke(inviteId),
        });
        return;
      }
      onRefresh();
    },
    [projectId, onRefresh, t]
  );

  const handleRemoveMember = useCallback(
    async (userId: string) => {
      const result = await removeProjectMember(projectId, userId);
      if (result.error) {
        setErrorDialog({
          open: true,
          title: t('teams.remove_error_title'),
          message: result.error,
          retry: () => handleRemoveMember(userId),
        });
        return;
      }
      onRefresh();
    },
    [projectId, onRefresh, t]
  );

  // Derived: can proceed from modules step?
  const canProceedFromModules =
    selectedModules.length > 0 &&
    selectedModules.every((m) => (modulePermissions[m] ?? []).length > 0);

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">
            {t('teams.title')}
          </h2>
        </div>
        <button
          type="button"
          onClick={handleToggleForm}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          {t('teams.invite_member')}
        </button>
      </div>

      {/* Generated invite link */}
      {generatedLink && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <p className="text-sm font-medium text-foreground">
            {t('teams.invite_link_ready')}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('teams.invite_link_hint')}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-muted rounded px-2 py-1.5 truncate text-foreground">
              {generatedLink}
            </code>
            <button
              type="button"
              onClick={() => handleCopyLink(generatedLink)}
              className="shrink-0 p-2 rounded-md hover:bg-accent transition-colors"
              aria-label={t('common.copy')}
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
              ) : (
                <Copy className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Invite form */}
      {showInviteForm && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          {/* ── Step 1: Email ─────────────────────────────────────── */}
          {step === 'email' && (
            <>
              <h3 className="text-sm font-semibold text-foreground">
                {t('teams.invite_member')}
              </h3>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t('teams.invite_email')}
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full text-sm rounded-md border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && inviteEmail.trim()) {
                      setStep(reusableRoles.length > 0 ? 'mode' : 'modules');
                    }
                  }}
                  autoFocus
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowInviteForm(false);
                    resetForm();
                  }}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setStep(reusableRoles.length > 0 ? 'mode' : 'modules')
                  }
                  disabled={!inviteEmail.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {t('teams.invite_next')}
                </button>
              </div>
            </>
          )}

          {/* ── Step 2: Mode (only when saved roles exist) ─────────── */}
          {step === 'mode' && (
            <>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep('email')}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  aria-label="Back"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <h3 className="text-sm font-semibold text-foreground">
                  {t('teams.invite_access_title')}
                </h3>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('teams.invite_email_summary')}{' '}
                <span className="font-medium text-foreground">
                  {inviteEmail}
                </span>
              </p>

              <div className="space-y-2">
                {/* Saved roles */}
                {reusableRoles.map((role) => (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => {
                      setMode('saved');
                      setSelectedRoleId(role.id);
                    }}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      mode === 'saved' && selectedRoleId === role.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-background hover:bg-accent/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-foreground">
                          {role.name}
                        </span>
                      </div>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${roleBadgeClass(role.effective_role_name)}`}
                      >
                        {roleLabel(role.effective_role_name)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 pl-6">
                      {role.allowed_modules.length} module
                      {role.allowed_modules.length !== 1 ? 's' : ''} ·{' '}
                      {role.granted_actions.length} permission
                      {role.granted_actions.length !== 1 ? 's' : ''}
                    </p>
                  </button>
                ))}

                {/* Custom option */}
                <button
                  type="button"
                  onClick={() => {
                    setMode('custom');
                    setSelectedRoleId(null);
                  }}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    mode === 'custom'
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-background hover:bg-accent/40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Plus className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium text-foreground">
                      {t('teams.invite_custom_label')}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 pl-6">
                    {t('teams.invite_custom_hint')}
                  </p>
                </button>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowInviteForm(false);
                    resetForm();
                  }}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (mode === 'saved' && selectedRoleId) {
                      setStep('review');
                    } else {
                      setStep('modules');
                    }
                  }}
                  disabled={mode === 'saved' && !selectedRoleId}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {t('teams.invite_next')}
                </button>
              </div>
            </>
          )}

          {/* ── Step 3: Module + permission selection ──────────────── */}
          {step === 'modules' && (
            <>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setStep(reusableRoles.length > 0 ? 'mode' : 'email')
                  }
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  aria-label="Back"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <h3 className="text-sm font-semibold text-foreground">
                  {t('teams.invite_modules_title')}
                </h3>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('teams.invite_modules_hint')}
              </p>

              <div className="grid grid-cols-1 gap-2">
                {ALL_MODULES.map(({ key, label }) => (
                  <ModuleCard
                    key={key}
                    moduleKey={key}
                    label={label}
                    isSelected={selectedModules.includes(key)}
                    isExpanded={expandedModule === key}
                    selectedPermissions={modulePermissions[key] ?? []}
                    onToggleModule={() => {
                      if (selectedModules.includes(key)) {
                        handleToggleModule(key);
                      } else {
                        handleToggleModule(key);
                        handleExpandModule(key);
                      }
                    }}
                    onTogglePermission={(actionKey) =>
                      handleTogglePermission(key, actionKey)
                    }
                  />
                ))}
              </div>

              {selectedModules.length > 0 &&
                !selectedModules.every(
                  (m) => (modulePermissions[m] ?? []).length > 0
                ) && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {t('teams.invite_modules_missing_permissions')}
                  </p>
                )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowInviteForm(false);
                    resetForm();
                  }}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => setStep('review')}
                  disabled={!canProceedFromModules}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {t('teams.invite_review')}
                </button>
              </div>
            </>
          )}

          {/* ── Step 4: Review + optional save ─────────────────────── */}
          {step === 'review' && (
            <>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep(mode === 'saved' ? 'mode' : 'modules')}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  aria-label="Back"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <h3 className="text-sm font-semibold text-foreground">
                  {t('teams.invite_review_title')}
                </h3>
              </div>

              <p className="text-xs text-muted-foreground">
                {t('teams.invite_email_summary')}{' '}
                <span className="font-medium text-foreground">
                  {inviteEmail}
                </span>
              </p>

              {/* Access summary */}
              <div className="rounded-lg border border-border bg-background p-3 space-y-2">
                {mode === 'saved' && selectedRoleId ? (
                  (() => {
                    const role = reusableRoles.find(
                      (r) => r.id === selectedRoleId
                    );
                    return role ? (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-foreground">
                            {role.name}
                          </span>
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded-full ${roleBadgeClass(role.effective_role_name)}`}
                          >
                            {roleLabel(role.effective_role_name)}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1 pt-1">
                          {role.allowed_modules.map((m) => {
                            const mod = ALL_MODULES.find((am) => am.key === m);
                            return (
                              <span
                                key={m}
                                className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium"
                              >
                                {mod?.label ?? m}
                              </span>
                            );
                          })}
                        </div>
                      </>
                    ) : null;
                  })()
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {t('teams.invite_review_access')}
                      </span>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${roleBadgeClass(effectiveRole)}`}
                      >
                        {roleLabel(effectiveRole)}
                      </span>
                    </div>
                    <div className="space-y-1.5 pt-1">
                      {selectedModules.map((moduleKey) => {
                        const mod = ALL_MODULES.find(
                          (m) => m.key === moduleKey
                        );
                        const perms = modulePermissions[moduleKey] ?? [];
                        const permLabels = perms.map(
                          (pk) =>
                            MODULE_PERMISSIONS[moduleKey]?.find(
                              (p) => p.key === pk
                            )?.label ?? pk
                        );
                        return (
                          <div key={moduleKey}>
                            <span className="text-xs font-medium text-foreground">
                              {mod?.label ?? moduleKey}
                            </span>
                            <p className="text-xs text-muted-foreground">
                              {permLabels.join(' · ')}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Save as reusable role (custom flow only) */}
              {mode === 'custom' && (
                <div className="space-y-2 pt-1 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setSaveAsRole((v) => !v)}
                    className="flex items-center gap-2 text-sm text-foreground hover:opacity-80 transition-opacity"
                  >
                    <span
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        saveAsRole
                          ? 'bg-primary border-primary'
                          : 'border-muted-foreground/40'
                      }`}
                    >
                      {saveAsRole && (
                        <Check className="w-2.5 h-2.5 text-primary-foreground" />
                      )}
                    </span>
                    {t('teams.invite_save_role')}
                  </button>
                  {saveAsRole && (
                    <input
                      type="text"
                      value={roleName}
                      onChange={(e) => setRoleName(e.target.value)}
                      placeholder={t('teams.invite_save_role_placeholder')}
                      className="w-full text-sm rounded-md border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      autoFocus
                    />
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowInviteForm(false);
                    resetForm();
                  }}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleInvite()}
                  disabled={inviteSaving || (saveAsRole && !roleName.trim())}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  <Mail className="w-4 h-4" />
                  {inviteSaving
                    ? t('common.loading')
                    : t('teams.generate_link')}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Members list */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">
          {t('teams.members_title')} ({members.length})
        </h3>
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('teams.no_members')}
          </p>
        ) : (
          <ul className="space-y-2">
            {members.map((m) => (
              <li
                key={m.user_id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card"
              >
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                  {m.display_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {m.display_name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {m.email}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {m.roles.map((r) => (
                    <span
                      key={r.id}
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${roleBadgeClass(r.name)}`}
                    >
                      {roleLabel(r.name)}
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => void handleRemoveMember(m.user_id)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    aria-label={t('teams.remove_member')}
                    title={t('teams.remove_member')}
                  >
                    <UserMinus className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Pending invites */}
      {invites.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            {t('teams.pending_invites')} ({invites.length})
          </h3>
          <ul className="space-y-2">
            {invites.map((inv) => {
              // Priority: invite_role_name → profile_name → role_name
              const displayLabel =
                inv.invite_role_name ??
                inv.profile_name ??
                roleLabel(inv.role_name);
              const badgeClass =
                inv.invite_role_name || inv.profile_name
                  ? 'bg-accent text-accent-foreground'
                  : roleBadgeClass(inv.role_name);
              return (
                <li
                  key={inv.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-border bg-card/50"
                >
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {inv.email}
                    </p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>
                        {t('teams.expires')}{' '}
                        {new Date(inv.expires_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${badgeClass}`}
                  >
                    {displayLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleRevoke(inv.id)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    aria-label={t('teams.revoke_invite')}
                    title={t('teams.revoke_invite')}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Error dialog */}
      {errorDialog && (
        <MutationErrorDialog
          open={errorDialog.open}
          onOpenChange={(open) =>
            setErrorDialog((prev) => (prev ? { ...prev, open } : null))
          }
          title={errorDialog.title}
          message={errorDialog.message}
          onTryAgain={() => {
            setErrorDialog(null);
            errorDialog.retry();
          }}
          onCancel={() => setErrorDialog(null)}
        />
      )}
    </div>
  );
}
