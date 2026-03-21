'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import type { AppNotification } from '@/app/actions/notifications';
import { markNotificationRead } from '@/app/actions/notifications';
import { t, type Locale } from '@/lib/i18n';

function roleLabel(locale: Locale, role: string): string {
  const key = `roles.${role}`;
  const translated = t(locale, key);
  return translated === key ? role.replaceAll('_', ' ') : translated;
}

function prevTeamsLabel(locale: Locale, names: string[]): string {
  if (names.length === 0) return '—';
  return names.join(locale === 'es' ? ', ' : ', ');
}

type Props = {
  notifications: AppNotification[];
  locale: Locale;
};

export function NotificationsListClient({ notifications, locale }: Props) {
  const router = useRouter();

  const onInteract = useCallback(
    async (id: string) => {
      const r = await markNotificationRead(id);
      if (r.ok) router.refresh();
    },
    [router]
  );

  return (
    <ul className="space-y-2">
      {notifications.map((n) => {
        const unread = n.read_at == null;
        const shellClass = `block rounded-lg border border-border p-4 transition-colors ${
          unread
            ? 'bg-muted/40 border-l-4 border-l-primary shadow-sm'
            : 'bg-card opacity-90'
        }`;

        if (n.type === 'invite_pending') {
          const showResolved =
            n.inviteStatus === 'accepted' || n.inviteStatus === 'rejected';
          return (
            <li key={n.id}>
              <Link
                href={n.href}
                onClick={() => void onInteract(n.id)}
                className={`${shellClass} hover:bg-accent/30`}
              >
                <p className="text-sm font-medium text-foreground">
                  {t(locale, 'notifications.invite_title', {
                    project: n.projectName,
                  })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t(locale, 'notifications.invite_message', {
                    role: roleLabel(locale, n.roleName),
                  })}
                </p>
                {showResolved && (
                  <p className="text-xs font-medium mt-2 text-foreground">
                    {n.inviteStatus === 'accepted'
                      ? t(locale, 'notifications.invite_status_accepted')
                      : t(locale, 'notifications.invite_status_rejected')}
                  </p>
                )}
                {n.inviteStatus === 'rejected' && n.rejectionReason && (
                  <p className="text-xs text-foreground mt-1 whitespace-pre-wrap">
                    {t(locale, 'notifications.invite_rejection_note', {
                      reason: n.rejectionReason,
                    })}
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground mt-2">
                  {new Date(n.created_at).toLocaleString()}
                  {unread
                    ? ` · ${t(locale, 'notifications.unread')}`
                    : ` · ${t(locale, 'notifications.read')}`}
                </p>
              </Link>
            </li>
          );
        }

        if (n.type === 'invite_response') {
          return (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => void onInteract(n.id)}
                className={`w-full text-left ${shellClass} hover:bg-accent/30 cursor-pointer`}
              >
                <p className="text-sm font-medium text-foreground">
                  {n.outcome === 'accepted'
                    ? t(locale, 'notifications.inviter_accepted_title', {
                        project: n.projectName,
                        name: n.inviteeDisplayName,
                      })
                    : t(locale, 'notifications.inviter_rejected_title', {
                        project: n.projectName,
                        name: n.inviteeDisplayName,
                      })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {n.inviteeEmail}
                </p>
                {n.outcome === 'rejected' && n.rejectionReason && (
                  <p className="text-xs text-foreground mt-2 whitespace-pre-wrap">
                    {t(locale, 'notifications.inviter_rejection_reason', {
                      reason: n.rejectionReason,
                    })}
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground mt-2">
                  {new Date(n.created_at).toLocaleString()}
                  {unread
                    ? ` · ${t(locale, 'notifications.unread')}`
                    : ` · ${t(locale, 'notifications.read')}`}
                </p>
              </button>
            </li>
          );
        }

        if (n.type === 'project_removed') {
          return (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => void onInteract(n.id)}
                className={`w-full text-left ${shellClass} hover:bg-accent/30 cursor-pointer`}
              >
                <p className="text-sm font-medium text-foreground">
                  {t(locale, 'notifications.removed_title', {
                    project: n.projectName,
                  })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t(locale, 'notifications.removed_body')}
                </p>
                {n.reason && (
                  <p className="text-xs text-foreground mt-2 whitespace-pre-wrap">
                    {t(locale, 'notifications.removed_reason', {
                      reason: n.reason,
                    })}
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground mt-2">
                  {new Date(n.created_at).toLocaleString()}
                  {unread
                    ? ` · ${t(locale, 'notifications.unread')}`
                    : ` · ${t(locale, 'notifications.read')}`}
                </p>
              </button>
            </li>
          );
        }

        return (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => void onInteract(n.id)}
              className={`w-full text-left ${shellClass} hover:bg-accent/30 cursor-pointer`}
            >
              <p className="text-sm font-medium text-foreground">
                {t(locale, 'notifications.sub_team_title', {
                  project: n.projectName,
                })}
              </p>
              <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                {n.firstAssignment
                  ? t(locale, 'notifications.sub_team_first', {
                      team: n.newTeamName,
                    })
                  : t(locale, 'notifications.sub_team_moved', {
                      newTeam: n.newTeamName,
                      prev: prevTeamsLabel(locale, n.previousTeamNames),
                    })}
              </p>
              <p className="text-[11px] text-muted-foreground mt-2">
                {new Date(n.created_at).toLocaleString()}
                {unread
                  ? ` · ${t(locale, 'notifications.unread')}`
                  : ` · ${t(locale, 'notifications.read')}`}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
