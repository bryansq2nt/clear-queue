'use client';

import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '@/components/shared/I18nProvider';
import { captureWithContext } from '@/lib/sentry';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { updateIdeaAction, deleteIdeaAction } from '@/app/actions/ideas';
import {
  linkIdeaToProjectAction,
  unlinkIdeaFromProjectAction,
} from '@/app/actions/idea-project-links';
import { getIdeaDataAction } from './load-idea-data';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Idea {
  id: string;
  title: string;
  description: string | null;
}

interface Project {
  id: string;
  name: string;
}

interface ProjectLink {
  id: string;
  project_id: string;
  role: string | null;
  created_at: string;
  project?: Project;
}

export default function IdeaDrawer({
  ideaId,
  isOpen,
  onClose,
  onUpdate,
}: {
  ideaId: string;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [idea, setIdea] = useState<Idea | null>(null);
  const [projectLinks, setProjectLinks] = useState<ProjectLink[]>([]);
  const [availableProjects, setAvailableProjects] = useState<
    { id: string; name: string }[]
  >([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadIdeaData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getIdeaDataAction(ideaId);
      if (result.error) {
        console.error('Failed to load idea:', result.error);
        return;
      }
      if (!result.idea) {
        console.error('Idea not found');
        return;
      }
      setIdea(result.idea);
      setProjectLinks(result.projectLinks ?? []);
      setAvailableProjects(result.availableProjects ?? []);
    } catch (error) {
      captureWithContext(error, {
        module: 'ideas',
        action: 'loadIdeaData',
        userIntent: 'Cargar detalle de la idea',
        expected: 'Se muestra la idea con vínculos a proyectos',
        extra: { ideaId },
      });
    } finally {
      setLoading(false);
    }
  }, [ideaId]);

  useEffect(() => {
    if (isOpen && ideaId) {
      loadIdeaData();
    }
  }, [isOpen, ideaId, loadIdeaData]);

  async function handleUpdate(formData: FormData) {
    if (!idea) return;

    formData.append('id', idea.id);
    const result = await updateIdeaAction(formData);

    if (result.data) {
      setIdea(result.data);
      setIsEditing(false);
      onUpdate();
    } else if (result.error) {
      alert(result.error);
    }
  }

  async function handleDelete() {
    if (!idea) return;

    if (!confirm(t('ideas.delete_idea_confirm'))) {
      return;
    }

    setIsDeleting(true);
    const result = await deleteIdeaAction(idea.id);

    if (result.success) {
      onClose();
      onUpdate();
      router.refresh();
    } else if (result.error) {
      alert(result.error);
      setIsDeleting(false);
    }
  }

  async function handleLinkProject(formData: FormData) {
    if (!idea) return;

    setLinkError(null);
    const projectId = formData.get('projectId') as string;
    const role = formData.get('role') as string | null;

    if (!projectId) {
      setLinkError('Please select a project');
      return;
    }

    const result = await linkIdeaToProjectAction(idea.id, projectId, role);

    if (result.data) {
      const form = document.getElementById(
        'link-project-form'
      ) as HTMLFormElement;
      form?.reset();
      router.refresh();
      onUpdate();
    } else if (result.error) {
      setLinkError(result.error);
    }
  }

  async function handleUnlink(linkId: string) {
    if (
      !confirm(
        'Are you sure you want to unlink this project? This action cannot be undone.'
      )
    ) {
      return;
    }

    const result = await unlinkIdeaFromProjectAction(linkId);

    if (result.success) {
      router.refresh();
      onUpdate();
    } else if (result.error) {
      alert(result.error);
    }
  }

  if (!idea) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('ideas.idea_details')}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center">{t('common.loading')}</div>
        ) : (
          <div className="space-y-6">
            {/* Title and Description */}
            <div>
              {isEditing ? (
                <form action={handleUpdate} className="space-y-4">
                  <div>
                    <label
                      htmlFor="title"
                      className="block text-sm font-medium mb-2"
                    >
                      {t('ideas.title_label')}
                    </label>
                    <Input
                      id="title"
                      name="title"
                      type="text"
                      required
                      defaultValue={idea.title}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="description"
                      className="block text-sm font-medium mb-2"
                    >
                      {t('ideas.description_label')}
                    </label>
                    <Textarea
                      id="description"
                      name="description"
                      rows={5}
                      defaultValue={idea.description || ''}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit">{t('common.save')}</Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsEditing(false)}
                    >
                      {t('common.cancel')}
                    </Button>
                  </div>
                </form>
              ) : (
                <div>
                  <div className="flex items-start justify-between mb-4">
                    <h2 className="text-2xl font-bold">{idea.title}</h2>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsEditing(true)}
                      >
                        {t('common.edit')}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleDelete}
                        disabled={isDeleting}
                      >
                        {isDeleting ? t('ideas.deleting') : t('common.delete')}
                      </Button>
                    </div>
                  </div>
                  {idea.description && (
                    <div className="prose max-w-none mb-4">
                      <p className="text-muted-foreground whitespace-pre-wrap">
                        {idea.description}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
