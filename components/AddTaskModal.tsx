'use client';

import { useState, useEffect } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { createTask } from '@/app/actions/tasks';
import { Database } from '@/lib/supabase/types';
import { normalizeTagsForSave } from '@/lib/board';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

type Task = Database['public']['Tables']['tasks']['Row'];

interface AddTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called immediately with optimistic task so parent can show it without waiting for server. */
  onTaskAdded: (createdTask: Task) => void;
  /** Called when server confirms creation; parent should replace optimistic task (with optimisticId) by realTask. */
  onTaskConfirmed?: (realTask: Task, optimisticId: string) => void;
  defaultProjectId: string;
  defaultStatus?: Database['public']['Tables']['tasks']['Row']['status'];
  /** When provided, create errors are reported here; retry() returns createTask result. optimisticId lets parent remove optimistic task on cancel. */
  onAddError?: (params: {
    message: string;
    retry: () => Promise<{ data?: Task; error?: string }>;
    optimisticId?: string;
  }) => void;
}

export function AddTaskModal({
  isOpen,
  onClose,
  onTaskAdded,
  onTaskConfirmed,
  defaultProjectId,
  defaultStatus = 'next',
  onAddError,
}: AddTaskModalProps) {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [status, setStatus] =
    useState<Database['public']['Tables']['tasks']['Row']['status']>(
      defaultStatus
    );
  const [priority, setPriority] = useState('3');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** Only used when onTaskConfirmed is not provided (legacy path: wait for server). */
  const [isLoading, setIsLoading] = useState(false);

  // When modal opens, sync status (and defaults) to the current view so the new task goes in the column the user is looking at.
  useEffect(() => {
    if (isOpen) {
      setStatus(defaultStatus);
    }
  }, [isOpen, defaultStatus]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!defaultProjectId) {
      setError(t('tasks.error_project_required'));
      return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('project_id', defaultProjectId);
    formData.append('status', status);
    formData.append('priority', priority);
    if (dueDate) formData.append('due_date', dueDate);
    if (notes) formData.append('notes', notes);
    const tagsNormalized = normalizeTagsForSave(tags);
    if (tagsNormalized) formData.append('tags', tagsNormalized);

    const optimisticMode = !!onTaskConfirmed;

    if (optimisticMode) {
      const optimisticId = `temp-${Date.now()}`;
      const now = new Date().toISOString();
      const optimisticTask: Task = {
        id: optimisticId,
        project_id: defaultProjectId,
        title: title.trim() || title,
        status,
        priority: parseInt(priority, 10) || 3,
        due_date: dueDate || null,
        notes: notes.trim() || null,
        tags: tagsNormalized || null,
        order_index: -1,
        created_at: now,
        updated_at: now,
      };
      onTaskAdded(optimisticTask);
      setTitle('');
      setStatus(defaultStatus);
      setPriority('3');
      setDueDate('');
      setNotes('');
      setTags('');
      onClose();

      createTask(formData).then((result) => {
        if (result.error) {
          if (onAddError) {
            onAddError({
              message: result.error,
              retry: () => createTask(formData),
              optimisticId,
            });
          } else {
            setError(result.error);
          }
        } else {
          const task = result.data as Task | undefined;
          if (task && onTaskConfirmed) onTaskConfirmed(task, optimisticId);
        }
      });
      return;
    }

    setIsLoading(true);
    const result = await createTask(formData);
    if (result.error) {
      if (onAddError) {
        onAddError({
          message: result.error,
          retry: () => createTask(formData),
        });
      } else {
        setError(result.error);
      }
      setIsLoading(false);
    } else {
      setTitle('');
      setStatus(defaultStatus);
      setPriority('3');
      setDueDate('');
      setNotes('');
      setTags('');
      const task = result.data as Task | undefined;
      if (task) onTaskAdded(task);
      onClose();
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[90vh] overflow-y-auto sm:w-full">
        <DialogHeader>
          <DialogTitle>{t('tasks.add_task')}</DialogTitle>
          <DialogDescription>
            {t('tasks.add_task_description')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">{t('tasks.title_label')}</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('tasks.title_placeholder')}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">{t('tasks.status_label')}</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="backlog">{t('kanban.backlog')}</SelectItem>
                  <SelectItem value="next">{t('kanban.next')}</SelectItem>
                  <SelectItem value="in_progress">
                    {t('kanban.in_progress')}
                  </SelectItem>
                  <SelectItem value="blocked">{t('kanban.blocked')}</SelectItem>
                  <SelectItem value="done">{t('kanban.done')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="priority">{t('tasks.priority_label')}</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">
                      {t('tasks.priority_lowest')}
                    </SelectItem>
                    <SelectItem value="2">2</SelectItem>
                    <SelectItem value="3">3</SelectItem>
                    <SelectItem value="4">4</SelectItem>
                    <SelectItem value="5">
                      {t('tasks.priority_highest')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="due_date">{t('tasks.due_date_label')}</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">{t('tasks.notes_label')}</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('tasks.notes_placeholder')}
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tags">{t('tasks.tags_label')}</Label>
              <Input
                id="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder={t('tasks.tags_placeholder')}
              />
            </div>
            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                {error}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? t('tasks.creating') : t('tasks.create_task')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
