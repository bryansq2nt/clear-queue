import { redirect } from 'next/navigation';
import { getInviteByToken, acceptInvite } from '@/app/actions/teams';
import { getUser } from '@/lib/auth';
import Link from 'next/link';
import { Users, AlertCircle, CheckCircle } from 'lucide-react';

function roleLabel(name: string): string {
  const map: Record<string, string> = {
    project_owner: 'Owner',
    project_editor: 'Editor',
    project_viewer: 'Viewer',
  };
  return map[name] ?? name;
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [invite, user] = await Promise.all([
    getInviteByToken(token),
    getUser(),
  ]);

  if (!invite) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-xl border border-border bg-card p-8 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
          <h1 className="text-xl font-semibold text-foreground">
            Invite not found
          </h1>
          <p className="text-muted-foreground text-sm">
            This invite link is invalid or has been removed.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Go home
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
            Invite revoked
          </h1>
          <p className="text-muted-foreground text-sm">
            This invite has been revoked by the project owner.
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
            Already accepted
          </h1>
          <p className="text-muted-foreground text-sm">
            This invite has already been accepted.
          </p>
          <Link
            href={`/context/${invite.project_id}/board`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Open project
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
            Invite expired
          </h1>
          <p className="text-muted-foreground text-sm">
            This invite expired on{' '}
            {new Date(invite.expires_at).toLocaleDateString()}.
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    // Not logged in — redirect to sign up/login with return URL
    const returnUrl = encodeURIComponent(`/invite/${token}`);
    redirect(`/login?returnUrl=${returnUrl}`);
  }

  // Server action for the form
  async function handleAccept() {
    'use server';
    const result = await acceptInvite(token);
    if (result.projectId) {
      redirect(`/context/${result.projectId}/board`);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full rounded-xl border border-border bg-card p-8 space-y-6">
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Users className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">
            You&apos;ve been invited
          </h1>
          <p className="text-muted-foreground text-sm">
            You&apos;ve been invited to join{' '}
            <span className="font-medium text-foreground">
              {invite.project_name}
            </span>{' '}
            as{' '}
            <span className="font-medium text-foreground">
              {roleLabel(invite.role_name)}
            </span>
            .
          </p>
        </div>

        <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground text-center">
          Joining as{' '}
          <span className="font-medium text-foreground">{user.email}</span>
        </div>

        <form action={handleAccept}>
          <button
            type="submit"
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity"
          >
            Accept invitation
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Invite expires on {new Date(invite.expires_at).toLocaleDateString()}.
        </p>
      </div>
    </div>
  );
}
