'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  XCircle,
  FileText,
  CheckSquare,
  Flag,
  Trash2,
  Pencil,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/components/shared/I18nProvider';
import type {
  CopilotProposal,
  TaskProposalPayload,
  NoteProposalPayload,
  MilestoneProposalPayload,
  DeleteMilestonePayload,
  UpdateMilestonePayload,
  DeleteTaskPayload,
  UpdateTaskPayload,
  DeleteNotePayload,
  UpdateNotePayload,
} from '@/lib/copilot/schema';

type AnyPayload =
  | TaskProposalPayload
  | NoteProposalPayload
  | MilestoneProposalPayload
  | DeleteMilestonePayload
  | UpdateMilestonePayload
  | DeleteTaskPayload
  | UpdateTaskPayload
  | DeleteNotePayload
  | UpdateNotePayload;

interface CopilotProposalCardProps {
  proposal: CopilotProposal;
  onApprove: (proposalId: string) => Promise<{ error?: string }>;
  onReject: (proposalId: string) => Promise<void>;
}

const DELETE_TYPES = new Set([
  'delete_milestone',
  'delete_task',
  'delete_note',
]);

const UPDATE_TYPES = new Set([
  'update_milestone',
  'update_task',
  'update_note',
]);

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

  const payload = proposal.payload as AnyPayload;
  const pType = payload.type;

  const isCreate =
    pType === 'task' || pType === 'note' || pType === 'milestone';
  const isDelete = DELETE_TYPES.has(pType);
  const isUpdate = UPDATE_TYPES.has(pType);
  const isMutation = isDelete || isUpdate;

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

  // ─── Type label + icon ────────────────────────────────────────────────────
  let typeLabel: string;
  let TypeIcon: React.ComponentType<{
    className?: string;
    'aria-hidden'?: boolean | 'true' | 'false';
  }>;

  switch (pType) {
    case 'task':
      typeLabel = t('copilot.proposal_task');
      TypeIcon = CheckSquare;
      break;
    case 'note':
      typeLabel = t('copilot.proposal_note');
      TypeIcon = FileText;
      break;
    case 'milestone':
      typeLabel = t('copilot.proposal_milestone');
      TypeIcon = Flag;
      break;
    case 'delete_milestone':
      typeLabel = t('copilot.proposal_delete_milestone');
      TypeIcon = Trash2;
      break;
    case 'update_milestone':
      typeLabel = t('copilot.proposal_update_milestone');
      TypeIcon = Pencil;
      break;
    case 'delete_task':
      typeLabel = t('copilot.proposal_delete_task');
      TypeIcon = Trash2;
      break;
    case 'update_task':
      typeLabel = t('copilot.proposal_update_task');
      TypeIcon = Pencil;
      break;
    case 'delete_note':
      typeLabel = t('copilot.proposal_delete_note');
      TypeIcon = Trash2;
      break;
    case 'update_note':
      typeLabel = t('copilot.proposal_update_note');
      TypeIcon = Pencil;
      break;
    default:
      typeLabel = pType;
      TypeIcon = FileText;
  }

  // ─── Title to display ─────────────────────────────────────────────────────
  const displayTitle: string = isMutation
    ? ((payload as { entity_title?: string }).entity_title ??
      (payload as { entity_id: string }).entity_id)
    : (payload as { title: string }).title;

  // ─── Created/acted link after approval ───────────────────────────────────
  const createdLink =
    isApproved && proposal.project_id
      ? (() => {
          switch (pType) {
            case 'task':
            case 'delete_task':
            case 'update_task':
              return `/context/${proposal.project_id}/board`;
            case 'note':
            case 'update_note':
              return pType === 'note' && proposal.created_entity_id
                ? `/context/${proposal.project_id}/notes/${proposal.created_entity_id}`
                : `/context/${proposal.project_id}/notes`;
            case 'milestone':
            case 'delete_milestone':
            case 'update_milestone':
              return `/context/${proposal.project_id}/milestones`;
            case 'delete_note':
              return `/context/${proposal.project_id}/notes`;
            default:
              return null;
          }
        })()
      : null;

  const createdLinkLabel = (() => {
    switch (pType) {
      case 'task':
      case 'update_task':
        return t('copilot.created_view_board');
      case 'note':
      case 'update_note':
        return t('copilot.created_view_notes');
      case 'milestone':
      case 'delete_milestone':
      case 'update_milestone':
        return t('copilot.created_view_milestones');
      case 'delete_task':
        return t('copilot.created_view_board');
      case 'delete_note':
        return t('copilot.created_view_notes');
      default:
        return null;
    }
  })();

  // ─── Mutation change summary ──────────────────────────────────────────────
  const mutationSummary = (() => {
    if (!isUpdate) return null;
    const parts: string[] = [];
    if (pType === 'update_task') {
      const p = payload as UpdateTaskPayload;
      if (p.status) parts.push(`status → ${p.status}`);
      if (p.priority != null) parts.push(`priority → ${p.priority}`);
      if (p.title) parts.push(`title → "${p.title}"`);
      if (p.milestone_id !== undefined)
        parts.push(
          p.milestone_id ? `milestone → ${p.milestone_id}` : 'remove milestone'
        );
    } else if (pType === 'update_milestone') {
      const p = payload as UpdateMilestonePayload;
      if (p.title) parts.push(`title → "${p.title}"`);
      if (p.description !== undefined)
        parts.push(p.description ? `description updated` : 'clear description');
    } else if (pType === 'update_note') {
      const p = payload as UpdateNotePayload;
      if (p.title) parts.push(`title → "${p.title}"`);
      if (p.content) parts.push('content updated');
    }
    return parts.length > 0 ? parts.join(' · ') : null;
  })();

  return (
    <div
      className={cn(
        'ml-11 max-w-xl rounded-xl border px-4 py-3 text-sm transition-opacity',
        isRejected
          ? 'opacity-40 border-border bg-muted/20'
          : isDelete
            ? 'border-destructive/30 bg-destructive/5'
            : 'border-primary/20 bg-primary/5'
      )}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <TypeIcon className="h-3.5 w-3.5" aria-hidden />
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
              className={cn(
                'inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
                isDelete
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              )}
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
          isRejected && 'line-through text-muted-foreground',
          isDelete && !isRejected && 'text-destructive'
        )}
      >
        {displayTitle}
      </p>

      {/* Details — create types */}
      {pType === 'task' &&
        (() => {
          const tp = payload as TaskProposalPayload;
          return tp.status || tp.priority ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {tp.status}
              {tp.priority != null && ` · Priority ${tp.priority}`}
            </p>
          ) : null;
        })()}

      {pType === 'milestone' &&
        !isApproved &&
        (payload as MilestoneProposalPayload).description && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
            {(payload as MilestoneProposalPayload).description}
          </p>
        )}

      {pType === 'note' && !isApproved && (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
          {(payload as NoteProposalPayload).content}
        </p>
      )}

      {/* Details — mutation types */}
      {mutationSummary && !isApproved && (
        <p className="mt-1 text-xs text-muted-foreground">{mutationSummary}</p>
      )}

      {/* Approved: link */}
      {isApproved && createdLink && createdLinkLabel && (
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
