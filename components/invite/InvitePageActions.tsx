'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { useI18n } from '@/components/shared/I18nProvider';
import { acceptInvite, rejectInvite } from '@/app/actions/teams';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface InvitePageActionsProps {
  token: string;
}

export default function InvitePageActions({ token }: InvitePageActionsProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [declined, setDeclined] = useState(false);
  const [acceptLoading, setAcceptLoading] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [declineLoading, setDeclineLoading] = useState(false);
  const [declineError, setDeclineError] = useState<string | null>(null);

  async function handleDeclineSubmit(e: React.FormEvent) {
    e.preventDefault();
    setDeclineLoading(true);
    setDeclineError(null);
    const result = await rejectInvite(token, declineReason.trim() || undefined);
    setDeclineLoading(false);
    if (result.error) {
      setDeclineError(result.error);
      return;
    }
    setDeclineOpen(false);
    setDeclineReason('');
    setDeclined(true);
  }

  if (declined) {
    return (
      <div className="text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-amber-500 mx-auto" />
        <h2 className="text-lg font-semibold text-foreground">
          {t('teams.invite_declined_title')}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t('teams.invite_declined_message')}
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          {t('teams.invite_go_home')}
        </Link>
      </div>
    );
  }

  async function handleAcceptClick() {
    setAcceptError(null);
    setAcceptLoading(true);
    const result = await acceptInvite(token);
    setAcceptLoading(false);
    if (result?.error) {
      setAcceptError(result.error);
      return;
    }
    if (result?.projectId) {
      router.push(`/context/${result.projectId}/board`);
    }
  }

  return (
    <>
      <div className="space-y-3">
        {acceptError && (
          <p className="text-sm text-destructive bg-destructive/10 p-2 rounded-md">
            {acceptError}
          </p>
        )}
        <button
          type="button"
          onClick={() => void handleAcceptClick()}
          disabled={acceptLoading}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {acceptLoading
            ? t('teams.invite_accepting')
            : t('teams.invite_accept')}
        </button>
        <button
          type="button"
          onClick={() => setDeclineOpen(true)}
          className="w-full py-2.5 rounded-lg border border-border bg-background font-medium text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          {t('teams.invite_decline')}
        </button>
      </div>

      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('teams.invite_decline_dialog_title')}</DialogTitle>
            <DialogDescription>
              {t('teams.invite_decline_dialog_description')}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleDeclineSubmit} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="decline-reason"
                className="text-sm font-medium text-foreground"
              >
                {t('teams.invite_decline_reason_label')}{' '}
                <span className="text-muted-foreground font-normal">
                  ({t('teams.optional')})
                </span>
              </label>
              <textarea
                id="decline-reason"
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder={t('teams.invite_decline_reason_placeholder')}
                className="w-full min-h-[80px] px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={declineLoading}
              />
            </div>
            {declineError && (
              <p className="text-sm text-destructive">{declineError}</p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeclineOpen(false)}
                disabled={declineLoading}
              >
                {t('teams.invite_decline_cancel')}
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={declineLoading}
              >
                {declineLoading
                  ? t('teams.invite_decline_sending')
                  : t('teams.invite_decline_confirm')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
