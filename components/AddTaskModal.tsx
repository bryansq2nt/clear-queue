'use client';

import { useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { createTask } from '@/app/actions/tasks';
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

interface AddTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTaskAdded: () => void;
  defaultProjectId: string;
  defaultStatus?: Database['public']['Tables']['tasks']['Row']['status'];
}

export function AddTaskModal({
  isOpen,
  onClose,
  onTaskAdded,
  defaultProjectId,
  defaultStatus = 'next',
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (!defaultProjectId) {
      setError(t('tasks.error_project_required'));
      setIsLoading(false);
      return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('project_id', defaultProjectId);
    formData.append('status', status);
    formData.append('priority', priority);
    if (dueDate) formData.append('due_date', dueDate);
    if (notes) formData.append('notes', notes);

    const result = await createTask(formData);

    if (result.error) {
      setError(result.error);
      setIsLoading(false);
    } else {
      setTitle('');
      setStatus(defaultStatus);
      setPriority('3');
      setDueDate('');
      setNotes('');
      onTaskAdded();
      onClose();
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
