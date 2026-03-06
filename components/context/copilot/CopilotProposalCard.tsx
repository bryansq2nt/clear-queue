'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle, FileText, CheckSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/components/shared/I18nProvider';
import type {
  CopilotProposal,
  TaskProposalPayload,
  NoteProposalPayload,
} from '@/lib/copilot/schema';

interface CopilotProposalCardProps {
  proposal: CopilotProposal;
  onReject: (proposalId: string) => Promise<void>;
}

export function CopilotProposalCard({
  proposal,
  onReject,
}: CopilotProposalCardProps) {
  const { t } = useI18n();
  const [isRejecting, setIsRejecting] = useState(false);

  const isRejected = proposal.status === 'rejected';
  const isApproved = proposal.status === 'approved';

  const payload = proposal.payload as TaskProposalPayload | NoteProposalPayload;
  const isTask = payload.type === 'task';

  const handleReject = async () => {
    if (isRejecting || isRejected || isApproved) return;
    setIsRejecting(true);
    await onReject(proposal.id);
    setIsRejecting(false);
  };

  return (
    <div
      className={cn(
        'ml-11 max-w-xl rounded-xl border px-4 py-3 text-sm transition-opacity',
        isRejected
          ? 'opacity-40 border-border bg-muted/20'
          : 'border-primary/20 bg-primary/5'
      )}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {isTask ? (
            <CheckSquare className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <FileText className="h-3.5 w-3.5" aria-hidden />
          )}
          <span>
            {isTask ? t('copilot.proposal_task') : t('copilot.proposal_note')}
          </span>
          {isRejected && (
            <span className="ml-1 text-destructive/70">
              — {t('copilot.proposal_rejected')}
            </span>
          )}
        </div>

        {!isRejected && !isApproved && (
          <div className="flex items-center gap-1.5">
            {/* Approve — disabled until Phase 3 */}
            <button
              type="button"
              disabled
              aria-label={t('copilot.approve')}
              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary opacity-40 cursor-not-allowed"
            >
              <CheckCircle2 className="h-3 w-3" aria-hidden />
              {t('copilot.approve')}
            </button>

            {/* Reject */}
            <button
              type="button"
              onClick={handleReject}
              disabled={isRejecting}
              aria-label={t('copilot.reject')}
              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <XCircle className="h-3 w-3" aria-hidden />
              {t('copilot.reject')}
            </button>
          </div>
        )}
      </div>

      {/* Title */}
      <p
        className={cn(
          'font-medium leading-snug',
          isRejected && 'line-through text-muted-foreground'
        )}
      >
        {payload.title}
      </p>

      {/* Details */}
      {isTask &&
        (() => {
          const tp = payload as TaskProposalPayload;
          return tp.status || tp.priority ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {tp.status}
              {tp.priority != null && ` · Priority ${tp.priority}`}
            </p>
          ) : null;
        })()}

      {!isTask && (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
          {(payload as NoteProposalPayload).content}
        </p>
      )}
    </div>
  );
}
