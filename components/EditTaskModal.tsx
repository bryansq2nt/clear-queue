'use client';

import { useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { updateTask, deleteTask } from '@/app/actions/tasks';
import { Database } from '@/lib/supabase/types';
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

export interface EditTaskErrorParams {
  message: string;
  previousTask: Task;
  retry: () => Promise<{ data?: Task; error?: string }>;
}

interface EditTaskModalProps {
  task: Task;
  isOpen: boolean;
  onClose: () => void;
  onTaskUpdate: () => void;
  /** When provided, success updates list without refresh; parent applies result.data */
  onTaskUpdated?: (updatedTask: Task) => void;
  /** When provided, save errors are reported here for parent to show MutationErrorDialog */
  onEditError?: (params: EditTaskErrorParams) => void;
}

export function EditTaskModal({
  task,
  isOpen,
  onClose,
  onTaskUpdate,
  onTaskUpdated,
  onEditError,
}: EditTaskModalProps) {
  const { t } = useI18n();
  const [title, setTitle] = useState(task.title);
  const [status, setStatus] = useState<Task['status']>(task.status);
  const [priority, setPriority] = useState(task.priority.toString());
  const [dueDate, setDueDate] = useState(task.due_date || '');
  const [notes, setNotes] = useState(task.notes || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function buildFormData() {
    const formData = new FormData();
    formData.append('title', title);
    formData.append('project_id', task.project_id);
    formData.append('status', status);
    formData.append('priority', priority);
    formData.append('due_date', dueDate || '');
    formData.append('notes', notes || '');
    return formData;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = buildFormData();

    if (onTaskUpdated) {
      const optimisticTask: Task = {
        ...task,
        title,
        status,
        priority: parseInt(priority, 10) || task.priority,
        due_date: dueDate || null,
        notes: notes || '',
      };
      onTaskUpdated(optimisticTask);
      onClose();
    }

    const result = await updateTask(task.id, formData);

    if (result.error) {
      if (onEditError) {
        onEditError({
          message: result.error,
          previousTask: task,
          retry: () => updateTask(task.id, buildFormData()),
        });
      } else {
        setError(result.error);
      }
      setIsLoading(false);
    } else {
      if (!onTaskUpdated) {
        onTaskUpdate();
        onClose();
      }
    }
  }

  async function handleDelete() {
    if (!confirm(t('tasks.delete_confirm'))) return;

    setIsDeleting(true);
    const result = await deleteTask(task.id);

    if (result.error) {
      setError(result.error);
      setIsDeleting(false);
    } else {
      onTaskUpdate();
      onClose();
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[90vh] overflow-y-auto sm:w-full">
        <DialogHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <DialogTitle>{t('tasks.edit_task')}</DialogTitle>
            <DialogDescription>
              {t('tasks.edit_task_description')}
            </DialogDescription>
          </div>
          <p className="text-xs text-muted-foreground shrink-0 pt-0.5 pr-8">
            {t('tasks.created')}{' '}
            {new Date(task.created_at).toLocaleDateString()}
            {task.updated_at && (
              <>
                {' '}
                · {t('tasks.updated')}{' '}
                {new Date(task.updated_at).toLocaleDateString()}
              </>
            )}
          </p>
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
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as Task['status'])}
              >
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
            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                {error}
              </div>
            )}
          </div>
          <DialogFooter className="flex justify-between">
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? t('tasks.deleting') : t('tasks.delete_task')}
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? t('tasks.saving') : t('tasks.save_changes')}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
