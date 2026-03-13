'use client';

import { useState, useCallback, useMemo } from 'react';
import { useI18n } from '@/components/shared/I18nProvider';
import {
  inviteProjectMember,
  revokeInvite,
  removeProjectMember,
} from '@/app/actions/teams';
import type {
  ProjectMember,
  ProjectInvite,
  ProjectAccessProfile,
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
  Settings2,
} from 'lucide-react';
import { MutationErrorDialog } from '@/components/board/MutationErrorDialog';

// ── Module catalogue (order matches tab bar) ───────────────────────────────────

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

/** Returns the set of module keys that are hidden, based on a profile's overrides. */
function hiddenModules(overrides: Record<string, boolean>): Set<string> {
  return new Set(
    Object.entries(overrides)
      .filter(([, v]) => v === false)
      .map(([k]) => k)
  );
}

// ── Module visibility preview ─────────────────────────────────────────────────

function ModulePreview({ overrides }: { overrides: Record<string, boolean> }) {
  const hidden = hiddenModules(overrides);
  return (
    <div className="flex flex-wrap gap-1 pt-1">
      {ALL_MODULES.map(({ key, label }) => (
        <span
          key={key}
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            hidden.has(key)
              ? 'bg-muted/60 text-muted-foreground line-through'
              : 'bg-primary/10 text-primary'
          }`}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

// ── Custom module toggle grid ─────────────────────────────────────────────────

function CustomModuleGrid({
  enabled,
  onToggle,
}: {
  enabled: Record<string, boolean>;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
      {ALL_MODULES.map(({ key, label }) => {
        const on = enabled[key] !== false;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onToggle(key)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors text-left ${
              on
                ? 'bg-primary/10 text-primary hover:bg-primary/20'
                : 'bg-muted/60 text-muted-foreground hover:bg-muted'
            }`}
          >
            <span
              className={`w-2.5 h-2.5 rounded-sm border shrink-0 ${
                on
                  ? 'bg-primary border-primary'
                  : 'border-muted-foreground/40 bg-transparent'
              }`}
            />
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type InviteStep = 'email' | 'profile';

interface Props {
  projectId: string;
  initialMembers: ProjectMember[];
  initialInvites: ProjectInvite[];
  roles: Array<{ id: string; name: string; description: string | null }>;
  profiles: ProjectAccessProfile[];
  onRefresh: () => void;
}

export default function ContextTeamClient({
  projectId,
  initialMembers,
  initialInvites,
  roles,
  profiles,
  onRefresh,
}: Props) {
  const { t } = useI18n();
  const [members] = useState<ProjectMember[]>(initialMembers);
  const [invites] = useState<ProjectInvite[]>(initialInvites);

  // Invite form state
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [step, setStep] = useState<InviteStep>('email');
  const [inviteEmail, setInviteEmail] = useState('');

  // Profile selection
  const defaultProfile = useMemo(
    () => profiles.find((p) => p.is_default) ?? profiles[0] ?? null,
    [profiles]
  );
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    defaultProfile?.id ?? null
  );
  const [isCustom, setIsCustom] = useState(false);
  // Custom config
  const [customModuleEnabled, setCustomModuleEnabled] = useState<
    Record<string, boolean>
  >(() => Object.fromEntries(ALL_MODULES.map(({ key }) => [key, true])));
  const [customRoleId, setCustomRoleId] = useState(
    roles.find((r) => r.name === 'project_editor')?.id ?? roles[0]?.id ?? ''
  );

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

  // The profile currently selected for preview
  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId]
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
    setSelectedProfileId(defaultProfile?.id ?? null);
    setIsCustom(false);
    setCustomModuleEnabled(
      Object.fromEntries(ALL_MODULES.map(({ key }) => [key, true]))
    );
    setCustomRoleId(
      roles.find((r) => r.name === 'project_editor')?.id ?? roles[0]?.id ?? ''
    );
  }, [defaultProfile, roles]);

  const handleToggleForm = useCallback(() => {
    if (showInviteForm) {
      resetForm();
    }
    setShowInviteForm((v) => !v);
    setGeneratedLink(null);
  }, [showInviteForm, resetForm]);

  const handleInvite = useCallback(async () => {
    if (!inviteEmail.trim()) return;
    setInviteSaving(true);

    let profileId: string | undefined;
    let roleId: string;

    if (isCustom) {
      // Custom: no saved profile, use raw role
      profileId = undefined;
      roleId = customRoleId;
    } else {
      profileId = selectedProfileId ?? undefined;
      // Fallback role: use the profile's base role if available, else editor
      roleId =
        activeProfile?.base_role_id ??
        roles.find((r) => r.name === 'project_editor')?.id ??
        roles[0]?.id ??
        '';
    }

    const result = await inviteProjectMember(
      projectId,
      inviteEmail.trim(),
      roleId,
      profileId
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
    inviteEmail,
    isCustom,
    customRoleId,
    selectedProfileId,
    activeProfile,
    roles,
    projectId,
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
          {/* Step 1 — Email */}
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
                      setStep('profile');
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
                  onClick={() => setStep('profile')}
                  disabled={!inviteEmail.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {t('teams.invite_next')}
                </button>
              </div>
            </>
          )}

          {/* Step 2 — Profile selection */}
          {step === 'profile' && (
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

              {/* Profile list */}
              <div className="space-y-1.5">
                {profiles.map((profile) => (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => {
                      setSelectedProfileId(profile.id);
                      setIsCustom(false);
                    }}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      !isCustom && selectedProfileId === profile.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-background hover:bg-accent/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {profile.name}
                      </span>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${roleBadgeClass(profile.base_role_name)}`}
                      >
                        {roleLabel(profile.base_role_name)}
                      </span>
                    </div>
                    {profile.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {profile.description}
                      </p>
                    )}
                    {/* Module preview for selected profile */}
                    {!isCustom && selectedProfileId === profile.id && (
                      <ModulePreview overrides={profile.module_overrides} />
                    )}
                  </button>
                ))}

                {/* Custom option */}
                <button
                  type="button"
                  onClick={() => {
                    setIsCustom(true);
                    setSelectedProfileId(null);
                  }}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    isCustom
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-background hover:bg-accent/40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Settings2 className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium text-foreground">
                      {t('teams.invite_custom_label')}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 pl-6">
                    {t('teams.invite_custom_hint')}
                  </p>
                </button>
              </div>

              {/* Custom configuration panel */}
              {isCustom && (
                <div className="space-y-3 pt-1 border-t border-border">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {t('teams.invite_role')}
                    </label>
                    <select
                      value={customRoleId}
                      onChange={(e) => setCustomRoleId(e.target.value)}
                      className="w-full text-sm rounded-md border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {roleLabel(r.name)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {t('teams.invite_modules')}
                    </label>
                    <CustomModuleGrid
                      enabled={customModuleEnabled}
                      onToggle={(key) =>
                        setCustomModuleEnabled((prev) => ({
                          ...prev,
                          [key]: !prev[key],
                        }))
                      }
                    />
                  </div>
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
                  disabled={inviteSaving || (!isCustom && !selectedProfileId)}
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
              const displayLabel = inv.profile_name ?? roleLabel(inv.role_name);
              const badgeClass = inv.profile_name
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
