'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  XCircle,
  FileText,
  CheckSquare,
  Flag,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/components/shared/I18nProvider';
import type {
  CopilotProposal,
  TaskProposalPayload,
  NoteProposalPayload,
  MilestoneProposalPayload,
} from '@/lib/copilot/schema';

interface CopilotProposalCardProps {
  proposal: CopilotProposal;
  onApprove: (proposalId: string) => Promise<{ error?: string }>;
  onReject: (proposalId: string) => Promise<void>;
}

export function CopilotProposalCard({
  proposal,
  onApprove,
  onReject,
}: CopilotProposalCardProps) {
  const { t } = useI18n();
  const [isRejecting, setIsRejecting] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  const isRejected = proposal.status === 'rejected';
  const isApproved = proposal.status === 'approved';

  const payload = proposal.payload as
    | TaskProposalPayload
    | NoteProposalPayload
    | MilestoneProposalPayload;
  const isTask = payload.type === 'task';
  const isMilestone = payload.type === 'milestone';

  const handleReject = async () => {
    if (isRejecting || isRejected || isApproved) return;
    setIsRejecting(true);
    await onReject(proposal.id);
    setIsRejecting(false);
  };

  const handleApprove = async () => {
    if (isApproving || isRejected || isApproved) return;
    setApproveError(null);
    setIsApproving(true);
    const result = await onApprove(proposal.id);
    setIsApproving(false);
    if (result?.error) setApproveError(result.error);
  };

  const createdLink =
    isApproved && proposal.created_entity_id && proposal.project_id
      ? isTask
        ? `/context/${proposal.project_id}/board`
        : isMilestone
          ? `/context/${proposal.project_id}/milestones`
          : `/context/${proposal.project_id}/notes/${proposal.created_entity_id}`
      : null;

  const typeLabel = isTask
    ? t('copilot.proposal_task')
    : isMilestone
      ? t('copilot.proposal_milestone')
      : t('copilot.proposal_note');

  const createdLinkLabel = isTask
    ? t('copilot.created_view_board')
    : isMilestone
      ? t('copilot.created_view_milestones')
      : t('copilot.created_view_notes');

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
          ) : isMilestone ? (
            <Flag className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <FileText className="h-3.5 w-3.5" aria-hidden />
          )}
          <span>{typeLabel}</span>
          {isRejected && (
            <span className="ml-1 text-destructive/70">
              — {t('copilot.proposal_rejected')}
            </span>
          )}
        </div>

        {!isRejected && !isApproved && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleApprove}
              disabled={isApproving}
              aria-label={t('copilot.approve')}
              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <CheckCircle2 className="h-3 w-3" aria-hidden />
              {t('copilot.approve')}
            </button>
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

      {isMilestone &&
        !isApproved &&
        (payload as MilestoneProposalPayload).description && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
            {(payload as MilestoneProposalPayload).description}
          </p>
        )}

      {!isTask && !isMilestone && !isApproved && (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
          {(payload as NoteProposalPayload).content}
        </p>
      )}

      {/* Approved: created link */}
      {isApproved && createdLink && (
        <p className="mt-2">
          <Link
            href={createdLink}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {createdLinkLabel}
            <ExternalLink className="h-3 w-3" aria-hidden />
          </Link>
        </p>
      )}

      {approveError && (
        <p className="mt-2 text-xs text-destructive">{approveError}</p>
      )}
    </div>
  );
}
