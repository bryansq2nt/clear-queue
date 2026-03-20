import { redirect } from 'next/navigation';
import { getInviteByToken } from '@/app/actions/teams';
import { getUser } from '@/lib/auth';
import { getProfileOptional } from '@/app/profile/actions';
import { t, type Locale } from '@/lib/i18n';
import Link from 'next/link';
import { Users, AlertCircle, CheckCircle, Eye } from 'lucide-react';
import InvitePageActions from '@/components/invite/InvitePageActions';

const MODULE_LABELS: Record<string, string> = {
  board: 'Tasks',
  notes: 'Notes',
  documents: 'Documents',
  media: 'Media',
  links: 'Links',
  milestones: 'Milestones',
  budgets: 'Budgets',
  ideas: 'Ideas',
  calendar: 'Calendar',
  todos: 'Todos',
};

function roleLabel(locale: Locale, name: string): string {
  const key = `roles.${name}`;
  const translated = t(locale, key);
  return translated === key ? name.replaceAll('_', ' ') : translated;
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [invite, user, profile] = await Promise.all([
    getInviteByToken(token),
    getUser(),
    getProfileOptional(),
  ]);
  const locale: Locale = profile?.locale === 'es' ? 'es' : 'en';

  if (!invite) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-xl border border-border bg-card p-8 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
          <h1 className="text-xl font-semibold text-foreground">
            {t(locale, 'invite_page.not_found_title')}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t(locale, 'invite_page.not_found_message')}
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            {t(locale, 'invite_page.go_home')}
          </Link>
        </div>
      </div>
    );
  }

  if (invite.status === 'revoked') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-xl border border-border bg-card p-8 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-orange-500 mx-auto" />
          <h1 className="text-xl font-semibold text-foreground">
            {t(locale, 'invite_page.revoked_title')}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t(locale, 'invite_page.revoked_message')}
          </p>
        </div>
      </div>
    );
  }

  if (invite.status === 'accepted') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-xl border border-border bg-card p-8 text-center space-y-4">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
          <h1 className="text-xl font-semibold text-foreground">
            {t(locale, 'invite_page.accepted_title')}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t(locale, 'invite_page.accepted_message')}
          </p>
          <Link
            href={`/context/${invite.project_id}/board`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            {t(locale, 'invite_page.open_project')}
          </Link>
        </div>
      </div>
    );
  }

  if (invite.status === 'rejected') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-xl border border-border bg-card p-8 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto" />
          <h1 className="text-xl font-semibold text-foreground">
            {t(locale, 'invite_page.rejected_title')}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t(locale, 'invite_page.rejected_message')}
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            {t(locale, 'invite_page.go_home')}
          </Link>
        </div>
      </div>
    );
  }

  const expired = new Date(invite.expires_at) < new Date();
  if (expired) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-xl border border-border bg-card p-8 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-orange-500 mx-auto" />
          <h1 className="text-xl font-semibold text-foreground">
            {t(locale, 'invite_page.expired_title')}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t(locale, 'invite_page.expired_message_prefix')}{' '}
            {new Date(invite.expires_at).toLocaleDateString()}.
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    // Not logged in — redirect to home (sign-in is on /) with return URL
    const returnUrl = encodeURIComponent(`/invite/${token}`);
    redirect(`/?returnUrl=${returnUrl}`);
  }

  // Only the invited email can accept; server enforces this too
  const emailMatches =
    user.email?.toLowerCase().trim() === invite.email.toLowerCase().trim();

  // Logged in as a different email — show message, no Accept button
  if (!emailMatches) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-xl border border-border bg-card p-8 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto" />
          <h1 className="text-xl font-semibold text-foreground">
            {t(locale, 'invite_page.wrong_account_title')}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t(locale, 'invite_page.wrong_account_message_prefix')}{' '}
            <span className="font-medium text-foreground">{invite.email}</span>.{' '}
            {t(locale, 'invite_page.wrong_account_message_middle')}{' '}
            <span className="font-medium text-foreground">{user.email}</span>.{' '}
            {t(locale, 'invite_page.wrong_account_message_suffix')}
          </p>
          <Link
            href={`/?returnUrl=${encodeURIComponent(`/invite/${token}`)}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            {t(locale, 'invite_page.sign_in_with_invited')}
          </Link>
          <Link
            href="/"
            className="block text-sm text-muted-foreground hover:text-foreground"
          >
            {t(locale, 'invite_page.go_home')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full rounded-xl border border-border bg-card p-8 space-y-6">
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Users className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">
            {t(locale, 'invite_page.invited_title')}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t(locale, 'invite_page.invited_message_prefix')}{' '}
            <span className="font-medium text-foreground">
              {invite.project_name}
            </span>{' '}
            {t(locale, 'invite_page.invited_message_as')}{' '}
            <span className="font-medium text-foreground">
              {roleLabel(locale, invite.role_name)}
            </span>
            .
          </p>
        </div>

        {invite.allowed_modules && invite.allowed_modules.length > 0 && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Eye className="w-3.5 h-3.5" />
              {t(locale, 'invite_page.access_to')}
            </div>
            <div className="flex flex-wrap gap-1">
              {invite.allowed_modules.map((key) => (
                <span
                  key={key}
                  className="text-xs px-2 py-0.5 rounded-full font-medium bg-primary/10 text-primary"
                >
                  {MODULE_LABELS[key] ?? key}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground text-center">
          {t(locale, 'invite_page.joining_as')}{' '}
          <span className="font-medium text-foreground">{user.email}</span>
        </div>

        <InvitePageActions token={token} />
        <Link
          href="/notifications"
          className="block text-center text-sm text-muted-foreground hover:text-foreground"
        >
          {t(locale, 'invite_page.back_to_notifications')}
        </Link>

        <p className="text-center text-xs text-muted-foreground">
          {t(locale, 'invite_page.expires_on')}{' '}
          {new Date(invite.expires_at).toLocaleDateString()}.
        </p>
      </div>
    </div>
  );
}
