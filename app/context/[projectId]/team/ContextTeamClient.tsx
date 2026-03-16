'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useI18n } from '@/components/shared/I18nProvider';
import {
  inviteProjectMember,
  createInviteRole,
  revokeInvite,
  removeProjectMember,
  sendInviteEmail,
  checkCanInviteEmail,
  getMemberAccess,
  updateMemberAccess,
  updateMemberAccessByInviteRole,
  updateMemberAccessFull,
} from '@/app/actions/teams';
import type {
  ProjectMember,
  ProjectInvite,
  RejectedInvite,
  ProjectAccessProfile,
  InviteRole,
  MemberAccess,
} from '@/app/actions/teams';
import {
  createProjectTeam,
  updateProjectTeam,
  deleteProjectTeam,
  addTeamMember,
  removeTeamMember,
  updateTeamMemberRole,
} from '@/app/actions/sub-teams';
import type { ProjectTeam, SubTeamsPermissions } from '@/app/actions/sub-teams';
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
  Pencil,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { toastSuccess } from '@/lib/ui/toast';
import { MutationErrorDialog } from '@/components/board/MutationErrorDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

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
    { key: 'tasks.read.own', label: 'View own tasks (assigned to me)' },
    { key: 'tasks.read.team', label: 'View sub-team tasks' },
    { key: 'tasks.read.project', label: 'View all project tasks' },
    // "Create tasks" implicitly grants edit + delete on tasks the member created.
    // Granular edit/delete/move permissions are not shown — they are implied.
    { key: 'tasks.create', label: 'Create tasks (includes edit & delete own)' },
    { key: 'tasks.assign', label: 'Assign / unassign tasks' },
    { key: 'tasks.delete', label: 'Delete any task' },
  ],
  notes: [
    { key: 'notes.read', label: 'View notes' },
    { key: 'notes.read.own', label: 'Read scope: own notes only' },
    { key: 'notes.read.team', label: 'Read scope: team notes' },
    { key: 'notes.read.project', label: 'Read scope: all project notes' },
    { key: 'notes.create', label: 'Create notes' },
    { key: 'notes.update_title', label: 'Edit title' },
    { key: 'notes.update_content', label: 'Edit content' },
    { key: 'notes.delete', label: 'Delete notes' },
  ],
  documents: [
    { key: 'documents.read', label: 'View documents' },
    { key: 'documents.read.own', label: 'Read scope: own documents only' },
    { key: 'documents.read.team', label: 'Read scope: team documents' },
    {
      key: 'documents.read.project',
      label: 'Read scope: all project documents',
    },
    { key: 'documents.upload', label: 'Upload files' },
    { key: 'documents.download', label: 'Download files' },
    { key: 'documents.update_metadata', label: 'Edit document details' },
    { key: 'documents.delete', label: 'Delete documents' },
  ],
  media: [
    { key: 'media.read', label: 'View media' },
    { key: 'media.read.own', label: 'Read scope: own media only' },
    { key: 'media.read.team', label: 'Read scope: team media' },
    { key: 'media.read.project', label: 'Read scope: all project media' },
    { key: 'media.upload', label: 'Upload media' },
    { key: 'media.update_metadata', label: 'Edit media details' },
    { key: 'media.delete', label: 'Delete media' },
  ],
  links: [
    { key: 'links.read', label: 'View links' },
    { key: 'links.read.own', label: 'Read scope: own links only' },
    { key: 'links.read.team', label: 'Read scope: team links' },
    { key: 'links.read.project', label: 'Read scope: all project links' },
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
    { key: 'budgets.read.own', label: 'Read scope: own budgets only' },
    { key: 'budgets.read.team', label: 'Read scope: team budgets' },
    { key: 'budgets.read.project', label: 'Read scope: all project budgets' },
    { key: 'budgets.create', label: 'Create budgets' },
    { key: 'budgets.update', label: 'Edit budgets' },
    { key: 'budgets.manage_items', label: 'Manage line items' },
    { key: 'budgets.delete', label: 'Delete budgets' },
  ],
  billings: [
    { key: 'billings.read', label: 'View billing records' },
    { key: 'billings.read.own', label: 'Read scope: own billing records only' },
    { key: 'billings.read.team', label: 'Read scope: team billing records' },
    {
      key: 'billings.read.project',
      label: 'Read scope: all project billing records',
    },
    { key: 'billings.create', label: 'Create billing records' },
    { key: 'billings.update_amount', label: 'Edit amount' },
    { key: 'billings.update_status', label: 'Change payment status' },
    { key: 'billings.update_description', label: 'Edit description' },
    { key: 'billings.delete', label: 'Delete billing records' },
  ],
  ideas: [
    { key: 'ideas.read', label: 'View mind maps' },
    { key: 'ideas.read.own', label: 'Read scope: own mind maps only' },
    { key: 'ideas.read.team', label: 'Read scope: team mind maps' },
    { key: 'ideas.read.project', label: 'Read scope: all project mind maps' },
    { key: 'ideas.create_board', label: 'Create mind maps' },
    { key: 'ideas.update_board', label: 'Edit mind map settings' },
    { key: 'ideas.create_node', label: 'Add nodes' },
    { key: 'ideas.update_node', label: 'Edit nodes' },
    { key: 'ideas.delete_node', label: 'Delete nodes' },
    { key: 'ideas.delete_board', label: 'Delete mind maps' },
  ],
  calendar: [
    { key: 'calendar.read', label: 'View events' },
    { key: 'calendar.read.own', label: 'Read scope: own events only' },
    { key: 'calendar.read.team', label: 'Read scope: team events' },
    { key: 'calendar.read.project', label: 'Read scope: all project events' },
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
  owner: [
    { key: 'owner.read', label: 'View client & business info' },
    { key: 'owner.create_client', label: 'Create client' },
    { key: 'owner.update_client', label: 'Edit client details' },
    { key: 'owner.delete_client', label: 'Delete client' },
    { key: 'owner.create_business', label: 'Create business' },
    { key: 'owner.update_business', label: 'Edit business details' },
    { key: 'owner.delete_business', label: 'Delete business' },
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
    'tasks.read.own',
    'tasks.read.team',
    'tasks.read.project',
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
  projectName: string;
  initialMembers: ProjectMember[];
  initialInvites: ProjectInvite[];
  initialRejectedInvites: RejectedInvite[];
  roles: Array<{ id: string; name: string; description: string | null }>;
  profiles: ProjectAccessProfile[];
  reusableRoles: InviteRole[];
  initialTeams: ProjectTeam[];
  subTeamsPermissions: SubTeamsPermissions;
  onRefresh: () => void;
}

export default function ContextTeamClient({
  projectId,
  projectName,
  initialMembers,
  initialInvites,
  initialRejectedInvites,
  profiles,
  reusableRoles,
  initialTeams,
  subTeamsPermissions,
  onRefresh,
}: Props) {
  const { t } = useI18n();
  const members = initialMembers;
  const invites = initialInvites;
  const rejectedInvites = initialRejectedInvites;

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
  const [lastInvitedEmail, setLastInvitedEmail] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorDialog, setErrorDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    retry: () => void;
  } | null>(null);
  const [revokeConfirmInvite, setRevokeConfirmInvite] =
    useState<ProjectInvite | null>(null);
  const [confirmRemoveMember, setConfirmRemoveMember] =
    useState<ProjectMember | null>(null);
  const [inviteSuccessDialog, setInviteSuccessDialog] = useState<{
    link: string;
    email: string;
    emailSent?: boolean;
    emailError?: string;
  } | null>(null);
  const [sendingEmailInDialog, setSendingEmailInDialog] = useState(false);
  const [sendingEmailForEmail, setSendingEmailForEmail] = useState<
    string | null
  >(null);

  // Edit member permissions dialog
  const [editMember, setEditMember] = useState<ProjectMember | null>(null);
  const [memberAccess, setMemberAccess] = useState<MemberAccess | null>(null);
  const [memberAccessLoading, setMemberAccessLoading] = useState(false);
  const [editMemberApplyValue, setEditMemberApplyValue] = useState<string>('');
  const [editMemberDraftModules, setEditMemberDraftModules] = useState<
    string[] | null
  >(null);
  const [editMemberDraftActions, setEditMemberDraftActions] = useState<
    string[]
  >([]);
  const [editMemberExpandedModule, setEditMemberExpandedModule] = useState<
    string | null
  >(null);
  const [editMemberSaving, setEditMemberSaving] = useState(false);
  const [editMemberLoadError, setEditMemberLoadError] = useState<string | null>(
    null
  );

  // Refs hold latest draft so Save uses current UI state even if React hasn't committed yet
  const latestDraftModulesRef = useRef<string[] | null>(null);
  const latestDraftActionsRef = useRef<string[]>([]);

  // ── Sub-teams state ───────────────────────────────────────────────
  const [teams, setTeams] = useState<ProjectTeam[]>(initialTeams);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);

  // Create sub-team dialog
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [createTeamName, setCreateTeamName] = useState('');
  const [createTeamDesc, setCreateTeamDesc] = useState('');
  const [createTeamSaving, setCreateTeamSaving] = useState(false);

  // Edit sub-team dialog
  const [editTeam, setEditTeam] = useState<ProjectTeam | null>(null);
  const [editTeamName, setEditTeamName] = useState('');
  const [editTeamDesc, setEditTeamDesc] = useState('');
  const [editTeamSaving, setEditTeamSaving] = useState(false);

  // Delete sub-team dialog
  const [deleteTeam, setDeleteTeam] = useState<ProjectTeam | null>(null);
  const [deleteTeamSaving, setDeleteTeamSaving] = useState(false);

  // Add member to sub-team dialog
  const [addMemberTeam, setAddMemberTeam] = useState<ProjectTeam | null>(null);
  const [addMemberUserId, setAddMemberUserId] = useState('');
  const [addMemberSaving, setAddMemberSaving] = useState(false);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  // Load member access when edit-permissions dialog opens
  useEffect(() => {
    if (!editMember) {
      setMemberAccess(null);
      setEditMemberApplyValue('');
      setEditMemberDraftModules(null);
      setEditMemberDraftActions([]);
      setEditMemberExpandedModule(null);
      setEditMemberLoadError(null);
      latestDraftModulesRef.current = null;
      latestDraftActionsRef.current = [];
      return;
    }
    let cancelled = false;
    setMemberAccessLoading(true);
    setMemberAccess(null);
    setEditMemberLoadError(null);
    getMemberAccess(projectId, editMember.user_id)
      .then((res) => {
        if (cancelled) return;
        setMemberAccessLoading(false);
        if (res.error) {
          setEditMemberLoadError(res.error);
          return;
        }
        if (res.data) {
          setMemberAccess(res.data);
          const modules =
            res.data.allowedModules === null ||
            res.data.allowedModules.length === 0
              ? null
              : [...res.data.allowedModules];
          const actions = Array.isArray(res.data.grantedActions)
            ? [...res.data.grantedActions]
            : [];
          setEditMemberDraftModules(modules);
          setEditMemberDraftActions(actions);
          latestDraftModulesRef.current = modules;
          latestDraftActionsRef.current = actions;
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setMemberAccessLoading(false);
        setEditMemberLoadError(
          err instanceof Error ? err.message : 'Failed to load permissions'
        );
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, editMember]);

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

  const handleShareLink = useCallback(
    async (link: string, label?: string) => {
      const title = label
        ? t('teams.invite_share_title_with_email', { email: label })
        : t('teams.invite_share_title');
      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({
            title,
            text: t('teams.invite_share_text'),
            url: link,
          });
        } catch (err) {
          if ((err as Error).name !== 'AbortError') {
            handleCopyLink(link);
          }
        }
      } else {
        handleCopyLink(link);
      }
    },
    [t, handleCopyLink]
  );

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
    setLastInvitedEmail(null);
    setEmailSent(false);
  }, [showInviteForm, resetForm]);

  const closeInviteSuccessDialog = useCallback(() => {
    setInviteSuccessDialog(null);
    setCopied(false);
    resetForm();
    setShowInviteForm(false);
    setGeneratedLink(null);
    setLastInvitedEmail(null);
    setEmailSent(false);
    onRefresh();
  }, [resetForm, onRefresh]);

  const handleEmailStepNext = useCallback(async () => {
    if (!inviteEmail.trim()) return;
    const check = await checkCanInviteEmail(projectId, inviteEmail.trim());
    if (!check.allowed) {
      const message =
        check.error === 'invite_already_pending'
          ? t('teams.invite_already_pending')
          : check.error === 'user_already_member'
            ? t('teams.user_already_member')
            : check.error;
      setErrorDialog({
        open: true,
        title: t('teams.invite_error_title'),
        message,
        retry: () => setErrorDialog(null),
      });
      return;
    }
    setStep(reusableRoles.length > 0 ? 'mode' : 'modules');
  }, [projectId, inviteEmail, reusableRoles.length, t]);

  const handleSendEmail = useCallback(async () => {
    if (!generatedLink || !lastInvitedEmail) return;
    setSendingEmail(true);
    setEmailSent(false);
    const result = await sendInviteEmail(
      lastInvitedEmail,
      generatedLink,
      projectName || undefined
    );
    setSendingEmail(false);
    if (result.error) {
      setErrorDialog({
        open: true,
        title: t('teams.invite_error_title'),
        message: result.error,
        retry: () => void handleSendEmail(),
      });
      return;
    }
    setEmailSent(true);
  }, [generatedLink, lastInvitedEmail, projectName, t]);

  const handleSendEmailFromDialog = useCallback(async () => {
    if (!inviteSuccessDialog) return;
    setSendingEmailInDialog(true);
    const result = await sendInviteEmail(
      inviteSuccessDialog.email,
      inviteSuccessDialog.link,
      projectName || undefined
    );
    setSendingEmailInDialog(false);
    if (result.error) {
      setErrorDialog({
        open: true,
        title: t('teams.invite_error_title'),
        message: result.error,
        retry: () => setErrorDialog(null),
      });
      return;
    }
    setInviteSuccessDialog((prev) =>
      prev ? { ...prev, emailSent: true, emailError: undefined } : null
    );
  }, [inviteSuccessDialog, projectName, t]);

  const handleSendEmailForPending = useCallback(
    async (inv: ProjectInvite) => {
      if (!inv.token) return;
      const link = `${baseUrl}/invite/${inv.token}`;
      setSendingEmailForEmail(inv.email);
      const result = await sendInviteEmail(
        inv.email,
        link,
        projectName || undefined
      );
      setSendingEmailForEmail(null);
      if (result.error) {
        setErrorDialog({
          open: true,
          title: t('teams.invite_error_title'),
          message: result.error,
          retry: () => setErrorDialog(null),
        });
      }
    },
    [baseUrl, projectName, t]
  );

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
      inviteRoleId,
      projectName || undefined
    );
    setInviteSaving(false);

    if (result.error) {
      const message =
        result.error === 'invite_already_pending'
          ? t('teams.invite_already_pending')
          : result.error === 'user_already_member'
            ? t('teams.user_already_member')
            : result.error;
      setErrorDialog({
        open: true,
        title: t('teams.invite_error_title'),
        message,
        retry: handleInvite,
      });
      return;
    }
    if (result.token) {
      const link = `${baseUrl}/invite/${result.token}`;
      const email = inviteEmail.trim();
      setInviteSuccessDialog({
        link,
        email,
        emailSent: result.emailSent,
        emailError: result.emailError,
      });
      // No refresh or form close here — dialog is shown; list updates when they close the dialog
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
    projectName,
    inviteEmail,
    baseUrl,
    t,
  ]);

  const handleRevoke = useCallback(
    async (inviteId: string) => {
      setRevokeConfirmInvite(null);
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
          retry: () => void handleRemoveMember(userId),
        });
        return;
      }
      setConfirmRemoveMember(null);
      onRefresh();
    },
    [projectId, onRefresh, t]
  );

  const handleApplyRoleOrProfile = useCallback(
    async (userId: string, value: string) => {
      if (!value) return;
      setEditMemberSaving(true);
      const isProfile = value.startsWith('profile:');
      const id = value.replace(/^(profile|role):/, '');
      const result = isProfile
        ? await updateMemberAccess(projectId, userId, id)
        : await updateMemberAccessByInviteRole(projectId, userId, id);
      setEditMemberSaving(false);
      if (result.error) {
        setErrorDialog({
          open: true,
          title: t('teams.edit_permissions_error_title'),
          message: result.error,
          retry: () => handleApplyRoleOrProfile(userId, value),
        });
        return;
      }
      setEditMemberApplyValue('');
      const next = await getMemberAccess(projectId, userId);
      if (next.data) {
        setMemberAccess(next.data);
        const modules =
          next.data.allowedModules === null ||
          next.data.allowedModules.length === 0
            ? null
            : [...next.data.allowedModules];
        const actions = [...next.data.grantedActions];
        setEditMemberDraftModules(modules);
        setEditMemberDraftActions(actions);
        latestDraftModulesRef.current = modules;
        latestDraftActionsRef.current = actions;
      }
      onRefresh();
    },
    [projectId, onRefresh, t]
  );

  const handleToggleEditMemberModuleDraft = useCallback(
    (moduleKey: string, currentlyHasAccess: boolean) => {
      setEditMemberDraftModules((prev) => {
        const nextList =
          prev === null
            ? ALL_MODULES.map((m) => m.key).filter((k) => k !== moduleKey)
            : currentlyHasAccess
              ? prev.filter((k) => k !== moduleKey)
              : [...prev, moduleKey];
        const next =
          nextList.length === 0 || nextList.length === ALL_MODULES.length
            ? null
            : nextList;
        latestDraftModulesRef.current = next;
        return next;
      });
    },
    []
  );

  const handleToggleEditMemberPermissionDraft = useCallback(
    (actionKey: string) => {
      setEditMemberDraftActions((prev) => {
        const next = prev.includes(actionKey)
          ? prev.filter((k) => k !== actionKey)
          : [...prev, actionKey];
        latestDraftActionsRef.current = next;
        return next;
      });
    },
    []
  );

  const handleSaveEditMember = useCallback(
    async (userId: string) => {
      setEditMemberSaving(true);
      const modulesToSave =
        latestDraftModulesRef.current ?? editMemberDraftModules;
      const actionsToSave =
        latestDraftActionsRef.current ?? editMemberDraftActions;
      const result = await updateMemberAccessFull(
        projectId,
        userId,
        modulesToSave,
        actionsToSave
      );
      setEditMemberSaving(false);
      if (result.error) {
        setErrorDialog({
          open: true,
          title: t('teams.edit_permissions_error_title'),
          message: result.error,
          retry: () => handleSaveEditMember(userId),
        });
        return;
      }
      toastSuccess(t('teams.permissions_saved_toast'));
      setEditMember(null);
      onRefresh();
    },
    [projectId, editMemberDraftModules, editMemberDraftActions, onRefresh, t]
  );

  // Derived: can proceed from modules step?
  const canProceedFromModules =
    selectedModules.length > 0 &&
    selectedModules.every((m) => (modulePermissions[m] ?? []).length > 0);

  // ── Sub-team handlers ────────────────────────────────────────────────

  const handleCreateTeam = useCallback(async () => {
    if (!createTeamName.trim()) return;
    setCreateTeamSaving(true);
    const { data, error } = await createProjectTeam(
      projectId,
      createTeamName,
      createTeamDesc || undefined
    );
    setCreateTeamSaving(false);
    if (error) {
      setErrorDialog({
        open: true,
        title: t('teams.create_sub_team_error_title'),
        message: error,
        retry: () => void handleCreateTeam(),
      });
      return;
    }
    if (data) setTeams((prev) => [...prev, data]);
    setCreateTeamOpen(false);
    setCreateTeamName('');
    setCreateTeamDesc('');
  }, [projectId, createTeamName, createTeamDesc, t]);

  const handleEditTeam = useCallback(async () => {
    if (!editTeam || !editTeamName.trim()) return;
    setEditTeamSaving(true);
    const { data, error } = await updateProjectTeam(
      editTeam.id,
      editTeamName,
      editTeamDesc || undefined
    );
    setEditTeamSaving(false);
    if (error) {
      setErrorDialog({
        open: true,
        title: t('teams.edit_sub_team_error_title'),
        message: error,
        retry: () => void handleEditTeam(),
      });
      return;
    }
    if (data) {
      setTeams((prev) =>
        prev.map((t) =>
          t.id === editTeam.id
            ? { ...t, name: data.name, description: data.description }
            : t
        )
      );
    }
    setEditTeam(null);
    setEditTeamName('');
    setEditTeamDesc('');
  }, [editTeam, editTeamName, editTeamDesc, t]);

  const handleDeleteTeam = useCallback(async () => {
    if (!deleteTeam) return;
    setDeleteTeamSaving(true);
    const { error } = await deleteProjectTeam(deleteTeam.id);
    setDeleteTeamSaving(false);
    if (error) {
      setErrorDialog({
        open: true,
        title: t('teams.delete_sub_team_error_title'),
        message: error,
        retry: () => void handleDeleteTeam(),
      });
      return;
    }
    setTeams((prev) => prev.filter((t) => t.id !== deleteTeam.id));
    setDeleteTeam(null);
  }, [deleteTeam, t]);

  const handleAddTeamMember = useCallback(async () => {
    if (!addMemberTeam || !addMemberUserId) return;
    setAddMemberSaving(true);
    const { data, error } = await addTeamMember(
      addMemberTeam.id,
      addMemberUserId
    );
    setAddMemberSaving(false);
    if (error) {
      setErrorDialog({
        open: true,
        title: t('teams.add_sub_team_member_error_title'),
        message: error,
        retry: () => void handleAddTeamMember(),
      });
      return;
    }
    if (data) {
      setTeams((prev) =>
        prev.map((team) =>
          team.id === addMemberTeam.id
            ? { ...team, members: [...team.members, data] }
            : team
        )
      );
    }
    setAddMemberTeam(null);
    setAddMemberUserId('');
  }, [addMemberTeam, addMemberUserId, t]);

  const handleRemoveTeamMember = useCallback(
    async (teamId: string, userId: string) => {
      const { error } = await removeTeamMember(teamId, userId);
      if (error) {
        setErrorDialog({
          open: true,
          title: t('teams.remove_sub_team_member_error_title'),
          message: error,
          retry: () => void handleRemoveTeamMember(teamId, userId),
        });
        return;
      }
      setTeams((prev) =>
        prev.map((team) =>
          team.id === teamId
            ? {
                ...team,
                members: team.members.filter((m) => m.user_id !== userId),
              }
            : team
        )
      );
    },
    [t]
  );

  const handleUpdateTeamMemberRole = useCallback(
    async (teamId: string, userId: string, role: 'member' | 'manager') => {
      const { error } = await updateTeamMemberRole(teamId, userId, role);
      if (error) {
        setErrorDialog({
          open: true,
          title: t('teams.update_sub_team_role_error_title'),
          message: error,
          retry: () => void handleUpdateTeamMemberRole(teamId, userId, role),
        });
        return;
      }
      setTeams((prev) =>
        prev.map((team) =>
          team.id === teamId
            ? {
                ...team,
                members: team.members.map((m) =>
                  m.user_id === userId ? { ...m, role } : m
                ),
              }
            : team
        )
      );
    },
    [t]
  );

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
              title={t('common.copy')}
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
              ) : (
                <Copy className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
            <button
              type="button"
              onClick={() => void handleSendEmail()}
              disabled={sendingEmail}
              className="shrink-0 p-2 rounded-md hover:bg-accent transition-colors disabled:opacity-50"
              aria-label={t('teams.invite_send_email')}
              title={t('teams.invite_send_email')}
            >
              {sendingEmail ? (
                <Clock className="w-4 h-4 text-muted-foreground animate-pulse" />
              ) : (
                <Mail className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          </div>
          {lastInvitedEmail && (
            <div className="flex items-center gap-2 pt-1 border-t border-border">
              <button
                type="button"
                onClick={() => void handleSendEmail()}
                disabled={sendingEmail}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <Mail className="w-4 h-4" />
                {sendingEmail
                  ? t('teams.invite_email_sending')
                  : emailSent
                    ? t('teams.invite_email_sent')
                    : t('teams.invite_send_email')}
              </button>
              {emailSent && (
                <span className="text-xs text-muted-foreground">
                  {t('teams.invite_email_sent_hint')}
                </span>
              )}
            </div>
          )}
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
                      void handleEmailStepNext();
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
                  onClick={() => void handleEmailStepNext()}
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
                    onClick={() => setEditMember(m)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    aria-label={t('teams.edit_permissions')}
                    title={t('teams.edit_permissions')}
                  >
                    <Shield className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRemoveMember(m)}
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
                  <div className="flex items-center gap-0.5 shrink-0">
                    {inv.token && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyLink(`${baseUrl}/invite/${inv.token}`)
                          }
                          className="p-1.5 rounded-md text-muted-foreground hover:bg-accent transition-colors"
                          aria-label={t('common.copy')}
                          title={t('common.copy')}
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSendEmailForPending(inv)}
                          disabled={sendingEmailForEmail === inv.email}
                          className="p-1.5 rounded-md text-muted-foreground hover:bg-accent transition-colors disabled:opacity-50"
                          aria-label={t('teams.invite_send_email')}
                          title={t('teams.invite_send_email')}
                        >
                          {sendingEmailForEmail === inv.email ? (
                            <Clock className="w-4 h-4 animate-pulse" />
                          ) : (
                            <Mail className="w-4 h-4" />
                          )}
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => setRevokeConfirmInvite(inv)}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      aria-label={t('teams.revoke_invite')}
                      title={t('teams.revoke_invite')}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Rejected invites */}
      {rejectedInvites.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            {t('teams.rejected_invites')} ({rejectedInvites.length})
          </h3>
          <ul className="space-y-2">
            {rejectedInvites.map((rej) => {
              const displayLabel =
                rej.invite_role_name ??
                rej.profile_name ??
                roleLabel(rej.role_name);
              return (
                <li
                  key={rej.id}
                  className="flex flex-col gap-1.5 p-3 rounded-lg border border-border bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <X className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {rej.email}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t('teams.rejected_at')}{' '}
                        {new Date(rej.rejected_at).toLocaleString()}
                        {' · '}
                        {displayLabel}
                      </p>
                    </div>
                  </div>
                  {rej.rejection_reason && (
                    <p className="text-xs text-muted-foreground pl-12">
                      {t('teams.rejection_reason_label')}:{' '}
                      {rej.rejection_reason}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Sub-teams section */}
      {subTeamsPermissions.canRead && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">
              {t('teams.sub_teams_title')} ({teams.length})
            </h3>
            {subTeamsPermissions.canCreate && (
              <button
                type="button"
                onClick={() => setCreateTeamOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('teams.create_sub_team')}
              </button>
            )}
          </div>

          {teams.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('teams.no_sub_teams')}{' '}
              {subTeamsPermissions.canCreate && t('teams.no_sub_teams_hint')}
            </p>
          ) : (
            <ul className="space-y-2">
              {teams.map((team) => {
                const isExpanded = expandedTeamId === team.id;
                const canManageThisTeam =
                  subTeamsPermissions.canManageMembers &&
                  (subTeamsPermissions.canCreate ||
                    subTeamsPermissions.managedTeamIds.includes(team.id));
                const canEditThisTeam =
                  subTeamsPermissions.canUpdate &&
                  (subTeamsPermissions.canCreate ||
                    subTeamsPermissions.managedTeamIds.includes(team.id));
                const memberCount = team.members.length;
                return (
                  <li
                    key={team.id}
                    className="rounded-lg border border-border bg-card overflow-hidden"
                  >
                    {/* Team header row */}
                    <div className="flex items-center gap-2 p-3">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedTeamId((prev) =>
                            prev === team.id ? null : team.id
                          )
                        }
                        className="p-1 rounded hover:bg-accent shrink-0 text-muted-foreground"
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {team.name}
                        </p>
                        {team.description && (
                          <p className="text-xs text-muted-foreground truncate">
                            {team.description}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {memberCount === 1
                          ? t('teams.sub_team_members_count_one')
                          : t('teams.sub_team_members_count', {
                              count: String(memberCount),
                            })}
                      </span>
                      {canEditThisTeam && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditTeam(team);
                            setEditTeamName(team.name);
                            setEditTeamDesc(team.description ?? '');
                          }}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                          aria-label={t('teams.edit_sub_team_dialog_title')}
                          title={t('teams.edit_sub_team_dialog_title')}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      {subTeamsPermissions.canDelete && (
                        <button
                          type="button"
                          onClick={() => setDeleteTeam(team)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          aria-label={t('teams.delete_sub_team_confirm_title')}
                          title={t('teams.delete_sub_team_confirm_title')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Expanded: member list */}
                    {isExpanded && (
                      <div className="border-t border-border px-3 pb-3 pt-2 space-y-2 bg-muted/20">
                        {team.members.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            {t('teams.sub_team_no_members')}
                          </p>
                        ) : (
                          <ul className="space-y-1.5">
                            {team.members.map((m) => (
                              <li
                                key={m.user_id}
                                className="flex items-center gap-2 text-sm"
                              >
                                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-semibold shrink-0">
                                  {(m.display_name ?? m.email ?? '?')
                                    .charAt(0)
                                    .toUpperCase()}
                                </div>
                                <span className="flex-1 text-sm text-foreground truncate">
                                  {m.display_name ?? m.email ?? m.user_id}
                                </span>
                                <span
                                  className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                                    m.role === 'manager'
                                      ? 'bg-primary/15 text-primary'
                                      : 'bg-muted text-muted-foreground'
                                  }`}
                                >
                                  {m.role === 'manager'
                                    ? t('teams.sub_team_role_manager')
                                    : t('teams.sub_team_role_member')}
                                </span>
                                {canManageThisTeam && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleUpdateTeamMemberRole(
                                          team.id,
                                          m.user_id,
                                          m.role === 'manager'
                                            ? 'member'
                                            : 'manager'
                                        )
                                      }
                                      className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 shrink-0"
                                      title={
                                        m.role === 'manager'
                                          ? t('teams.make_sub_team_member')
                                          : t('teams.make_sub_team_manager')
                                      }
                                    >
                                      {m.role === 'manager'
                                        ? t('teams.make_sub_team_member')
                                        : t('teams.make_sub_team_manager')}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleRemoveTeamMember(
                                          team.id,
                                          m.user_id
                                        )
                                      }
                                      className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                                      aria-label={t(
                                        'teams.remove_sub_team_member'
                                      )}
                                      title={t('teams.remove_sub_team_member')}
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                        {canManageThisTeam && (
                          <button
                            type="button"
                            onClick={() => {
                              setAddMemberTeam(team);
                              setAddMemberUserId('');
                            }}
                            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            {t('teams.add_sub_team_member')}
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* Create sub-team dialog */}
      <Dialog
        open={createTeamOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCreateTeamOpen(false);
            setCreateTeamName('');
            setCreateTeamDesc('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('teams.create_sub_team_dialog_title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                {t('teams.create_sub_team_name_label')}
              </label>
              <input
                type="text"
                value={createTeamName}
                onChange={(e) => setCreateTeamName(e.target.value)}
                placeholder={t('teams.create_sub_team_name_placeholder')}
                className="w-full text-sm rounded-md border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                autoFocus
                maxLength={100}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                {t('teams.create_sub_team_description_label')}
              </label>
              <input
                type="text"
                value={createTeamDesc}
                onChange={(e) => setCreateTeamDesc(e.target.value)}
                placeholder={t('teams.create_sub_team_description_placeholder')}
                className="w-full text-sm rounded-md border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCreateTeamOpen(false);
                setCreateTeamName('');
                setCreateTeamDesc('');
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => void handleCreateTeam()}
              disabled={createTeamSaving || !createTeamName.trim()}
            >
              {createTeamSaving
                ? t('common.saving')
                : t('teams.create_sub_team_btn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit sub-team dialog */}
      <Dialog
        open={!!editTeam}
        onOpenChange={(open) => {
          if (!open) {
            setEditTeam(null);
            setEditTeamName('');
            setEditTeamDesc('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('teams.edit_sub_team_dialog_title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                {t('teams.create_sub_team_name_label')}
              </label>
              <input
                type="text"
                value={editTeamName}
                onChange={(e) => setEditTeamName(e.target.value)}
                placeholder={t('teams.create_sub_team_name_placeholder')}
                className="w-full text-sm rounded-md border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                autoFocus
                maxLength={100}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                {t('teams.create_sub_team_description_label')}
              </label>
              <input
                type="text"
                value={editTeamDesc}
                onChange={(e) => setEditTeamDesc(e.target.value)}
                placeholder={t('teams.create_sub_team_description_placeholder')}
                className="w-full text-sm rounded-md border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditTeam(null);
                setEditTeamName('');
                setEditTeamDesc('');
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => void handleEditTeam()}
              disabled={editTeamSaving || !editTeamName.trim()}
            >
              {editTeamSaving
                ? t('common.saving')
                : t('teams.edit_sub_team_btn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete sub-team confirmation */}
      <Dialog
        open={!!deleteTeam}
        onOpenChange={(open) => !open && setDeleteTeam(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('teams.delete_sub_team_confirm_title')}
            </DialogTitle>
            <DialogDescription>
              {deleteTeam
                ? t('teams.delete_sub_team_confirm_message', {
                    name: deleteTeam.name,
                  })
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTeam(null)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteTeamSaving}
              onClick={() => void handleDeleteTeam()}
            >
              {deleteTeamSaving
                ? t('common.loading')
                : t('teams.delete_sub_team_confirm_btn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add member to sub-team dialog */}
      <Dialog
        open={!!addMemberTeam}
        onOpenChange={(open) => {
          if (!open) {
            setAddMemberTeam(null);
            setAddMemberUserId('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {addMemberTeam
                ? t('teams.add_sub_team_member_dialog_title', {
                    name: addMemberTeam.name,
                  })
                : ''}
            </DialogTitle>
          </DialogHeader>
          {addMemberTeam &&
            (() => {
              const alreadyInTeam = new Set(
                addMemberTeam.members.map((m) => m.user_id)
              );
              const available = members.filter(
                (m) => !alreadyInTeam.has(m.user_id)
              );
              return available.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  {t('teams.add_sub_team_member_none_available')}
                </p>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">
                      {t('teams.add_sub_team_member_select_label')}
                    </label>
                    <select
                      value={addMemberUserId}
                      onChange={(e) => setAddMemberUserId(e.target.value)}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    >
                      <option value="">
                        {t('teams.add_sub_team_member_select_placeholder')}
                      </option>
                      {available.map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.display_name} ({m.email})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })()}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAddMemberTeam(null);
                setAddMemberUserId('');
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => void handleAddTeamMember()}
              disabled={addMemberSaving || !addMemberUserId}
            >
              {addMemberSaving
                ? t('common.saving')
                : t('teams.add_sub_team_member_btn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite sent success dialog */}
      <Dialog
        open={!!inviteSuccessDialog}
        onOpenChange={(open) => {
          if (!open) closeInviteSuccessDialog();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="w-5 h-5 shrink-0 text-green-600 dark:text-green-400" />
              {t('teams.invite_sent_dialog_title')}
            </DialogTitle>
            <DialogDescription>
              {inviteSuccessDialog
                ? t('teams.invite_sent_dialog_message', {
                    email: inviteSuccessDialog.email,
                  })
                : ''}
            </DialogDescription>
          </DialogHeader>
          {inviteSuccessDialog && (
            <div className="space-y-4">
              {/* Link in a wrapping block so it doesn't overflow */}
              <div className="rounded-lg border border-border bg-muted/50 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1.5">
                  {t('teams.invite_link_label')}
                </p>
                <code className="block text-xs text-foreground break-all">
                  {inviteSuccessDialog.link}
                </code>
              </div>
              {/* Copy and Share as clear, labeled buttons */}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyLink(inviteSuccessDialog.link)}
                  className="inline-flex items-center gap-2"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                  {copied ? t('teams.invite_copied') : t('common.copy')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleSendEmailFromDialog()}
                  disabled={sendingEmailInDialog}
                  className="inline-flex items-center gap-2"
                >
                  <Mail className="w-4 h-4" />
                  {sendingEmailInDialog
                    ? t('teams.invite_email_sending')
                    : t('teams.invite_send_email')}
                </Button>
              </div>
              {inviteSuccessDialog.emailSent && (
                <p className="text-xs text-muted-foreground">
                  {t('teams.invite_email_sent_hint')}
                </p>
              )}
              {inviteSuccessDialog.emailError && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {inviteSuccessDialog.emailError}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              onClick={closeInviteSuccessDialog}
              className="bg-primary text-primary-foreground"
            >
              {t('teams.invite_sent_dialog_done')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke invite confirmation */}
      <Dialog
        open={!!revokeConfirmInvite}
        onOpenChange={(open) => !open && setRevokeConfirmInvite(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('teams.revoke_confirm_title')}</DialogTitle>
            <DialogDescription>
              {revokeConfirmInvite
                ? t('teams.revoke_confirm_message', {
                    email: revokeConfirmInvite.email,
                  })
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRevokeConfirmInvite(null)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() =>
                revokeConfirmInvite && void handleRevoke(revokeConfirmInvite.id)
              }
            >
              {t('teams.revoke_confirm_btn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove member confirmation */}
      <Dialog
        open={!!confirmRemoveMember}
        onOpenChange={(open) => !open && setConfirmRemoveMember(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('teams.remove_confirm_title')}</DialogTitle>
            <DialogDescription>
              {confirmRemoveMember
                ? t('teams.remove_confirm_message', {
                    name:
                      confirmRemoveMember.display_name ||
                      confirmRemoveMember.email,
                  })
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmRemoveMember(null)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() =>
                confirmRemoveMember &&
                void handleRemoveMember(confirmRemoveMember.user_id)
              }
            >
              {t('teams.remove_confirm_btn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit member permissions dialog */}
      <Dialog
        open={!!editMember}
        onOpenChange={(open) => !open && setEditMember(null)}
      >
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {editMember
                ? t('teams.edit_permissions_title', {
                    name: editMember.display_name,
                  })
                : t('teams.edit_permissions_title_fallback')}
            </DialogTitle>
            <DialogDescription>
              {t('teams.edit_permissions_description')}
            </DialogDescription>
          </DialogHeader>
          {memberAccessLoading ? (
            <div className="py-6 text-sm text-muted-foreground animate-pulse">
              {t('common.loading')}
            </div>
          ) : editMemberLoadError ? (
            <div className="py-6 space-y-3">
              <p className="text-sm text-destructive">
                {t('teams.edit_permissions_load_error')}
              </p>
              <p className="text-xs text-muted-foreground font-mono break-all">
                {editMemberLoadError}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditMemberLoadError(null);
                  if (editMember) {
                    setMemberAccessLoading(true);
                    getMemberAccess(projectId, editMember.user_id).then(
                      (res) => {
                        setMemberAccessLoading(false);
                        if (res.data) {
                          setMemberAccess(res.data);
                          setEditMemberLoadError(null);
                          setEditMemberDraftModules(
                            res.data.allowedModules === null ||
                              res.data.allowedModules.length === 0
                              ? null
                              : [...res.data.allowedModules]
                          );
                          setEditMemberDraftActions(
                            Array.isArray(res.data.grantedActions)
                              ? [...res.data.grantedActions]
                              : []
                          );
                        } else if (res.error) {
                          setEditMemberLoadError(res.error);
                        }
                      }
                    );
                  }
                }}
              >
                {t('mutation_error.try_again')}
              </Button>
            </div>
          ) : editMember && memberAccess ? (
            <div className="space-y-4 overflow-y-auto min-h-0">
              {/* Apply role or profile (one-click replace) */}
              <div>
                <label
                  htmlFor="edit-member-apply"
                  className="text-xs font-medium text-muted-foreground block mb-2"
                >
                  {t('teams.apply_role_or_profile')}
                </label>
                <select
                  id="edit-member-apply"
                  value={editMemberApplyValue}
                  onChange={(e) => {
                    const v = e.target.value;
                    setEditMemberApplyValue(v);
                    if (v) void handleApplyRoleOrProfile(editMember.user_id, v);
                  }}
                  disabled={editMemberSaving}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="">{t('teams.select_role_or_profile')}</option>
                  <optgroup label={t('teams.profiles_group')}>
                    {profiles.map((p) => (
                      <option key={p.id} value={`profile:${p.id}`}>
                        {p.name}
                        {p.allowed_modules && p.allowed_modules.length > 0
                          ? ` (${p.allowed_modules.length} ${t('teams.modules')})`
                          : ''}
                      </option>
                    ))}
                  </optgroup>
                  {reusableRoles.length > 0 && (
                    <optgroup label={t('teams.saved_roles_group')}>
                      {reusableRoles.map((r) => (
                        <option key={r.id} value={`role:${r.id}`}>
                          {r.name ?? roleLabel(r.effective_role_name)}
                          {r.allowed_modules?.length
                            ? ` (${r.allowed_modules.length} ${t('teams.modules')})`
                            : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {editMemberSaving && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('common.saving')}
                  </p>
                )}
              </div>

              {/* Current role summary */}
              <p className="text-xs text-muted-foreground">
                {t('teams.current_roles')}:{' '}
                {memberAccess.roleNames.length > 0
                  ? memberAccess.roleNames
                      .map((name) => roleLabel(name))
                      .join(', ')
                  : '—'}
                {' · '}
                {t('teams.determined_by_role')}
              </p>

              {/* Visible modules: list with checkbox + expandable permissions (draft only; Save applies) */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  {t('teams.visible_modules')}
                </p>
                <ul className="space-y-0 border border-border rounded-lg divide-y divide-border overflow-hidden">
                  {ALL_MODULES.map((mod) => {
                    const hasAccess =
                      editMemberDraftModules === null ||
                      editMemberDraftModules.includes(mod.key);
                    const perms = MODULE_PERMISSIONS[mod.key] ?? [];
                    const expanded = editMemberExpandedModule === mod.key;
                    return (
                      <li key={mod.key} className="bg-card">
                        <div className="flex items-center gap-2 p-2">
                          <button
                            type="button"
                            onClick={() =>
                              setEditMemberExpandedModule((prev) =>
                                prev === mod.key ? null : mod.key
                              )
                            }
                            className="p-1 rounded hover:bg-accent shrink-0 text-muted-foreground"
                            aria-expanded={expanded}
                          >
                            {expanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                          <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={hasAccess}
                              onChange={() =>
                                handleToggleEditMemberModuleDraft(
                                  mod.key,
                                  hasAccess
                                )
                              }
                              className="rounded border-input"
                            />
                            <span className="text-sm font-medium text-foreground truncate">
                              {mod.label}
                            </span>
                          </label>
                        </div>
                        {expanded && (
                          <div className="px-3 pb-3 pt-0 pl-10 border-t border-border bg-muted/30">
                            <p className="text-xs text-muted-foreground mb-2 mt-2">
                              {t('teams.permissions_in_module')} ({perms.length}
                              )
                            </p>
                            <ul className="space-y-1.5">
                              {perms.map((perm) => {
                                const hasPerm = editMemberDraftActions.includes(
                                  perm.key
                                );
                                return (
                                  <li
                                    key={perm.key}
                                    className="flex items-center gap-2 text-sm"
                                  >
                                    <label className="flex items-center gap-2 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={hasPerm}
                                        onChange={() =>
                                          handleToggleEditMemberPermissionDraft(
                                            perm.key
                                          )
                                        }
                                        className="rounded border-input"
                                      />
                                      <span
                                        className={
                                          hasPerm
                                            ? 'text-foreground'
                                            : 'text-muted-foreground'
                                        }
                                      >
                                        {perm.label}
                                      </span>
                                    </label>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          ) : null}
          {editMember && editMemberLoadError ? (
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditMember(null)}
              >
                {t('common.close')}
              </Button>
            </DialogFooter>
          ) : null}
          {editMember && !memberAccessLoading && memberAccess ? (
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditMember(null)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                onClick={() => handleSaveEditMember(editMember.user_id)}
                disabled={editMemberSaving}
              >
                {editMemberSaving ? t('common.saving') : t('common.save')}
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>

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
