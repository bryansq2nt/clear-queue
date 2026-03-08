'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/components/shared/I18nProvider';
import { getProposalTypeConfig } from './card-renderers';
import type {
  CopilotProposal,
  TaskProposalPayload,
  MilestoneProposalPayload,
  NoteProposalPayload,
  MindMapProposalPayload,
  UpdateTaskPayload,
  UpdateMilestonePayload,
  UpdateNotePayload,
  LinkProposalPayload,
  UpdateLinkPayload,
  TodoItemProposalPayload,
  ToggleTodoPayload,
  BillingProposalPayload,
  UpdateBillingPayload,
} from '@/lib/copilot/schema';

interface CopilotProposalCardProps {
  proposal: CopilotProposal;
  onApprove: (proposalId: string) => Promise<{ error?: string }>;
  onReject: (proposalId: string) => Promise<void>;
  onUndo?: (proposalId: string) => Promise<{ error?: string }>;
}

export function CopilotProposalCard({
  proposal,
  onApprove,
  onReject,
  onUndo,
}: CopilotProposalCardProps) {
  const { t } = useI18n();
  const [isRejecting, setIsRejecting] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  const isRejected = proposal.status === 'rejected';
  const isApproved = proposal.status === 'approved';

  const payload = proposal.payload as unknown as Record<string, unknown>;
  const pType = String(payload.type ?? '');

  const config = getProposalTypeConfig(pType);
  const { Icon, cardVariant } = config;

  const isDelete = cardVariant === 'delete';
  const isUpdate = cardVariant === 'update';

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

  const handleUndo = async () => {
    if (isUndoing || !onUndo) return;
    setApproveError(null);
    setIsUndoing(true);
    const result = await onUndo(proposal.id);
    setIsUndoing(false);
    if (result?.error) setApproveError(result.error);
  };

  // ─── Type label ───────────────────────────────────────────────────────────
  const typeLabel = config.labelKey ? t(config.labelKey) : pType;

  // ─── Display title ────────────────────────────────────────────────────────
  const displayTitle: string = config.getTitle
    ? config.getTitle(payload)
    : isDelete || isUpdate
      ? ((payload.entity_title as string | undefined) ??
        (payload.entity_id as string))
      : (payload.title as string);

  // ─── Created link after approval ──────────────────────────────────────────
  const createdLink =
    isApproved && proposal.project_id && config.getViewLink
      ? config.getViewLink(proposal.project_id, proposal.created_entity_id)
      : null;

  const createdLinkLabel = config.viewLinkLabelKey
    ? t(config.viewLinkLabelKey)
    : null;

  // ─── Type-specific details ────────────────────────────────────────────────
  const details = (() => {
    if (isApproved) return null;

    if (pType === 'task') {
      const tp = payload as unknown as TaskProposalPayload;
      if (!tp.status && tp.priority == null) return null;
      return (
        <p className="mt-1 text-xs text-muted-foreground">
          {tp.status}
          {tp.priority != null && ` · Priority ${tp.priority}`}
        </p>
      );
    }

    if (pType === 'milestone') {
      const mp = payload as unknown as MilestoneProposalPayload;
      if (!mp.description) return null;
      return (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
          {mp.description}
        </p>
      );
    }

    if (pType === 'note') {
      const np = payload as unknown as NoteProposalPayload;
      return (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
          {np.content}
        </p>
      );
    }

    if (pType === 'mind_map') {
      const mm = payload as unknown as MindMapProposalPayload;
      return (
        <p className="mt-1 text-xs text-muted-foreground">
          {mm.nodes.length} nodes · {mm.edges.length} connections
          {mm.board_description && (
            <>
              {' '}
              · <span className="italic">{mm.board_description}</span>
            </>
          )}
        </p>
      );
    }

    if (pType === 'update_task') {
      const p = payload as unknown as UpdateTaskPayload;
      const parts: string[] = [];
      if (p.status) parts.push(`status → ${p.status}`);
      if (p.priority != null) parts.push(`priority → ${p.priority}`);
      if (p.title) parts.push(`title → "${p.title}"`);
      if (p.milestone_id !== undefined)
        parts.push(
          p.milestone_id ? `milestone → ${p.milestone_id}` : 'remove milestone'
        );
      return parts.length > 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {parts.join(' · ')}
        </p>
      ) : null;
    }

    if (pType === 'update_milestone') {
      const p = payload as unknown as UpdateMilestonePayload;
      const parts: string[] = [];
      if (p.title) parts.push(`title → "${p.title}"`);
      if (p.description !== undefined)
        parts.push(p.description ? 'description updated' : 'clear description');
      return parts.length > 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {parts.join(' · ')}
        </p>
      ) : null;
    }

    if (pType === 'update_note') {
      const p = payload as unknown as UpdateNotePayload;
      const parts: string[] = [];
      if (p.title) parts.push(`title → "${p.title}"`);
      if (p.content) parts.push('content updated');
      return parts.length > 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {parts.join(' · ')}
        </p>
      ) : null;
    }

    if (pType === 'link') {
      const p = payload as unknown as LinkProposalPayload;
      return (
        <p className="mt-1 text-xs text-muted-foreground truncate">
          {p.url}
          {p.category_name && ` · ${p.category_name}`}
        </p>
      );
    }

    if (pType === 'update_link') {
      const p = payload as unknown as UpdateLinkPayload;
      const parts: string[] = [];
      if (p.title) parts.push(`title → "${p.title}"`);
      if (p.url) parts.push(`url updated`);
      if (p.category_name !== undefined)
        parts.push(
          p.category_name ? `category → ${p.category_name}` : 'remove category'
        );
      return parts.length > 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {parts.join(' · ')}
        </p>
      ) : null;
    }

    if (pType === 'todo_item') {
      const p = payload as unknown as TodoItemProposalPayload;
      return (
        <p className="mt-1 text-xs text-muted-foreground truncate">
          {p.due_date && `Due ${p.due_date}`}
        </p>
      );
    }

    if (pType === 'toggle_todo') {
      const p = payload as unknown as ToggleTodoPayload;
      return (
        <p className="mt-1 text-xs text-muted-foreground">
          {p.is_done ? 'Mark as not done' : 'Mark as done'}
        </p>
      );
    }

    if (pType === 'billing') {
      const p = payload as unknown as BillingProposalPayload;
      const parts: string[] = [];
      if (p.billing_type) parts.push(p.billing_type);
      if (p.amount != null) parts.push(`$${Number(p.amount).toLocaleString()}`);
      if (p.status) parts.push(p.status);
      if (p.due_date) parts.push(`due ${p.due_date}`);
      if (p.category_name) parts.push(p.category_name);
      return parts.length > 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {parts.join(' · ')}
        </p>
      ) : null;
    }

    if (pType === 'update_billing') {
      const p = payload as unknown as UpdateBillingPayload;
      const parts: string[] = [];
      if (p.status) parts.push(`status → ${p.status}`);
      if (p.amount != null)
        parts.push(`amount → $${Number(p.amount).toLocaleString()}`);
      if (p.billing_type) parts.push(`type → ${p.billing_type}`);
      if (p.due_date !== undefined)
        parts.push(p.due_date ? `due → ${p.due_date}` : 'remove due date');
      if (p.category_name !== undefined)
        parts.push(
          p.category_name ? `category → ${p.category_name}` : 'remove category'
        );
      return parts.length > 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {parts.join(' · ')}
        </p>
      ) : null;
    }

    return null;
  })();

  return (
    <div
      className={cn(
        'ml-8 sm:ml-11 max-w-xl rounded-xl border px-3 sm:px-4 py-3 text-sm transition-opacity',
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
          <Icon className="h-3.5 w-3.5" aria-hidden />
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

      {/* Type-specific details */}
      {details}

      {/* Approved delete: show "Deleted" + Undo */}
      {isApproved && isDelete && (
        <p className="mt-2 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {t('copilot.deleted')}
          </span>
          {onUndo && (
            <button
              type="button"
              disabled={isUndoing}
              onClick={handleUndo}
              className="text-xs text-primary hover:underline disabled:opacity-50"
            >
              {isUndoing ? '…' : t('copilot.undo')}
            </button>
          )}
        </p>
      )}

      {/* Approved non-delete: link */}
      {isApproved && !isDelete && createdLink && createdLinkLabel && (
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
