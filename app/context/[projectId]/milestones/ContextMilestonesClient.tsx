'use client';

import { useState, useCallback } from 'react';
import {
  createMilestone,
  updateMilestone,
  deleteMilestone,
  completeMilestone,
  reopenMilestone,
  type MilestonesPermissions,
} from '@/app/actions/milestones';
import type { MilestoneWithProgress } from '@/lib/milestones/schema';
import { useI18n } from '@/components/shared/I18nProvider';
import { Plus, Flag, Check, Pencil, Trash2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface ContextMilestonesClientProps {
  projectId: string;
  initialMilestones: MilestoneWithProgress[];
  permissions: MilestonesPermissions;
}

export default function ContextMilestonesClient({
  projectId,
  initialMilestones,
  permissions,
}: ContextMilestonesClientProps) {
  const { t } = useI18n();
  const [milestones, setMilestones] =
    useState<MilestoneWithProgress[]>(initialMilestones);
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteConfirmMilestoneId, setDeleteConfirmMilestoneId] = useState<
    string | null
  >(null);
  const [completeConfirmMilestone, setCompleteConfirmMilestone] =
    useState<MilestoneWithProgress | null>(null);
  const [reopenConfirmMilestone, setReopenConfirmMilestone] =
    useState<MilestoneWithProgress | null>(null);

  // ── Realtime subscription slot (empty until Realtime phase) ───────────────
  // useEffect(() => {
  //   const channel = supabase
  //     .channel(`milestones:${projectId}`)
  //     .on('postgres_changes', { event: '*', schema: 'public', table: 'milestones',
  //         filter: `project_id=eq.${projectId}` },
  //       (payload) => { /* reconcile setMilestones */ })
  //     .subscribe();
  //   return () => { supabase.removeChannel(channel); };
  // }, [projectId]);

  const handleCreate = useCallback(async () => {
    const title = createTitle.trim();
    if (!title) return;
    setBusy(true);
    setError(null);
    const result = await createMilestone(projectId, {
      title,
      description: createDescription.trim() || undefined,
    });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.data) {
      setMilestones((prev) => [
        ...prev,
        {
          ...result.data!,
          tasks_total: 0,
          tasks_done: 0,
        },
      ]);
      setCreateOpen(false);
      setCreateTitle('');
      setCreateDescription('');
    }
  }, [projectId, createTitle, createDescription]);

  const handleUpdate = useCallback(
    async (milestoneId: string) => {
      setBusy(true);
      setError(null);
      const result = await updateMilestone(milestoneId, {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
      });
      setBusy(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.data) {
        setMilestones((prev) =>
          prev.map((m) => {
            if (m.id !== milestoneId) return m;
            return {
              ...m,
              ...result.data!,
              tasks_total: m.tasks_total,
              tasks_done: m.tasks_done,
            };
          })
        );
        setEditId(null);
      }
    },
    [editTitle, editDescription]
  );

  const handleComplete = useCallback(
    async (milestoneId: string) => {
      setBusy(true);
      setError(null);
      const result = await completeMilestone(milestoneId);
      setBusy(false);
      if (result.error) {
        setError(
          result.error === 'MILESTONE_INCOMPLETE_TASKS'
            ? t('milestones.complete_all_tasks_first')
            : result.error
        );
        return;
      }
      if (result.data) {
        setCompleteConfirmMilestone(null);
        setMilestones((prev) =>
          prev.map((m) =>
            m.id === milestoneId
              ? {
                  ...m,
                  status: 'completed' as const,
                  completed_at: result.data!.completed_at,
                }
              : m
          )
        );
        setEditId(null);
      }
    },
    [t]
  );

  const handleReopen = useCallback(async (milestoneId: string) => {
    setBusy(true);
    setError(null);
    const result = await reopenMilestone(milestoneId);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.data) {
      setReopenConfirmMilestone(null);
      setMilestones((prev) =>
        prev.map((m) =>
          m.id === milestoneId
            ? {
                ...m,
                status: 'pending' as const,
                completed_at: null,
                tasks_done: 0,
              }
            : m
        )
      );
      setEditId(null);
    }
  }, []);

  const handleDelete = useCallback(async (milestoneId: string) => {
    setBusy(true);
    setError(null);
    const result = await deleteMilestone(milestoneId);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setMilestones((prev) => prev.filter((m) => m.id !== milestoneId));
    setEditId(null);
    setDeleteConfirmMilestoneId(null);
  }, []);

  const openEdit = useCallback((m: MilestoneWithProgress) => {
    setEditId(m.id);
    setEditTitle(m.title);
    setEditDescription(m.description ?? '');
  }, []);

  const firstIncompleteIndex = milestones.findIndex((m) => {
    const allTasksDone = m.tasks_total === 0 || m.tasks_done === m.tasks_total;
    return !(m.status === 'completed' && allTasksDone);
  });

  return (
    <div className="p-4 md:p-6 min-h-full flex flex-col">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h2 className="text-lg font-semibold truncate">
          {t('milestones.timeline')}
        </h2>
        {permissions.canCreate && (
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => setCreateOpen(true)}
            disabled={busy}
          >
            <Plus className="h-4 w-4 mr-1.5" aria-hidden />
            {t('milestones.add')}
          </Button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {milestones.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-center text-muted-foreground py-12">
          <Flag className="h-12 w-12 mb-3 opacity-50" aria-hidden />
          <p className="font-medium">{t('milestones.empty')}</p>
          <p className="text-sm mt-1">{t('milestones.empty_hint')}</p>
          {permissions.canCreate && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-4 w-4 mr-1.5" aria-hidden />
              {t('milestones.add')}
            </Button>
          )}
        </div>
      ) : (
        <ul className="space-y-0" role="list">
          {milestones.map((m, index) => {
            const allTasksDone =
              m.tasks_total === 0 || m.tasks_done === m.tasks_total;
            const isCompleted = m.status === 'completed' && allTasksDone;
            const isCurrent = firstIncompleteIndex === index && !isCompleted;
            return (
              <li
                key={m.id}
                className={cn(
                  'flex items-start gap-4 py-4 border-b border-border last:border-b-0',
                  isCurrent && 'bg-muted/40'
                )}
              >
                <div
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2',
                    isCompleted
                      ? 'border-primary bg-primary text-primary-foreground'
                      : isCurrent
                        ? 'border-primary bg-background'
                        : 'border-muted-foreground/30 bg-muted/50'
                  )}
                  aria-hidden
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <span className="text-xs font-medium">{index + 1}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={cn(
                        'font-medium',
                        isCompleted && 'text-muted-foreground line-through'
                      )}
                    >
                      {m.title}
                    </span>
                    {isCurrent && (
                      <span className="rounded bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                        {t('milestones.current')}
                      </span>
                    )}
                  </div>
                  {m.description && (
                    <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                      {m.description}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('milestones.progress_count', {
                      done: m.tasks_done,
                      total: m.tasks_total,
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {permissions.canComplete &&
                    (!isCompleted ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setCompleteConfirmMilestone(m)}
                        disabled={busy}
                        aria-label={t('milestones.mark_complete')}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setReopenConfirmMilestone(m)}
                        disabled={busy}
                        aria-label={t('milestones.mark_incomplete')}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    ))}
                  {permissions.canUpdate && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEdit(m)}
                      disabled={busy}
                      aria-label={t('common.edit')}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {permissions.canDelete && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteConfirmMilestoneId(m.id)}
                      disabled={busy}
                      aria-label={t('common.delete')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('milestones.add')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-title">
                {t('milestones.title_label')}
              </Label>
              <Input
                id="create-title"
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                placeholder={t('milestones.title_placeholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-desc">
                {t('milestones.description_label')} ({t('common.optional')})
              </Label>
              <Input
                id="create-desc"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder={t('milestones.description_placeholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              onClick={handleCreate}
              disabled={!createTitle.trim() || busy}
            >
              {t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editId} onOpenChange={(open) => !open && setEditId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('milestones.edit')}</DialogTitle>
          </DialogHeader>
          {editId && (
            <>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-title">
                    {t('milestones.title_label')}
                  </Label>
                  <Input
                    id="edit-title"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder={t('milestones.title_placeholder')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-desc">
                    {t('milestones.description_label')}
                  </Label>
                  <Input
                    id="edit-desc"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder={t('milestones.description_placeholder')}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditId(null)}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  type="button"
                  onClick={() => handleUpdate(editId)}
                  disabled={!editTitle.trim() || busy}
                >
                  {t('common.save')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Reopen milestone confirmation dialog */}
      <Dialog
        open={!!reopenConfirmMilestone}
        onOpenChange={(open) => !open && setReopenConfirmMilestone(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('milestones.reopen_dialog_title')}</DialogTitle>
            <DialogDescription>
              {t('milestones.reopen_confirm_message')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReopenConfirmMilestone(null)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() =>
                reopenConfirmMilestone &&
                handleReopen(reopenConfirmMilestone.id)
              }
            >
              {t('milestones.reopen_confirm_btn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete milestone confirmation dialog */}
      <Dialog
        open={!!completeConfirmMilestone}
        onOpenChange={(open) => !open && setCompleteConfirmMilestone(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('milestones.complete_confirm_title')}</DialogTitle>
            <DialogDescription>
              {t('milestones.complete_confirm_message')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCompleteConfirmMilestone(null)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() =>
                completeConfirmMilestone &&
                handleComplete(completeConfirmMilestone.id)
              }
            >
              {t('milestones.complete_confirm_btn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteConfirmMilestoneId}
        onOpenChange={(open) => !open && setDeleteConfirmMilestoneId(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('milestones.delete_dialog_title')}</DialogTitle>
            <DialogDescription>
              {t('milestones.delete_confirm')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteConfirmMilestoneId(null)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() =>
                deleteConfirmMilestoneId &&
                handleDelete(deleteConfirmMilestoneId)
              }
            >
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
