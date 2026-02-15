'use client';

import { useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { updateIdeaAction, deleteIdeaAction } from '../actions';
import {
  linkIdeaToProjectAction,
  unlinkIdeaFromProjectAction,
} from './project-link-actions';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Idea {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
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

export default function IdeaDetailClient({
  idea: initialIdea,
  projectLinks: initialProjectLinks,
  availableProjects,
}: {
  idea: Idea;
  projectLinks: ProjectLink[];
  availableProjects: { id: string; name: string }[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [idea, setIdea] = useState(initialIdea);
  const [isDeleting, setIsDeleting] = useState(false);
  const [projectLinks, setProjectLinks] = useState(initialProjectLinks);
  const [linkError, setLinkError] = useState<string | null>(null);

  async function handleUpdate(formData: FormData) {
    formData.append('id', idea.id);
    const result = await updateIdeaAction(formData);

    if (result.data) {
      setIdea(result.data);
      setIsEditing(false);
      router.refresh();
    } else if (result.error) {
      alert(result.error);
    }
  }

  async function handleDelete() {
    if (!confirm(t('ideas.delete_idea_confirm'))) {
      return;
    }

    setIsDeleting(true);
    const result = await deleteIdeaAction(idea.id);

    if (result.success) {
      router.push('/ideas');
    } else if (result.error) {
      alert(result.error);
      setIsDeleting(false);
    }
  }

  async function handleLinkProject(formData: FormData) {
    setLinkError(null);
    const projectId = formData.get('projectId') as string;
    const role = formData.get('role') as string | null;

    if (!projectId) {
      setLinkError(t('ideas.please_select_project'));
      return;
    }

    const result = await linkIdeaToProjectAction(idea.id, projectId, role);

    if (result.data) {
      // Reset form
      const form = document.getElementById(
        'link-project-form'
      ) as HTMLFormElement;
      form?.reset();
      router.refresh();
    } else if (result.error) {
      setLinkError(result.error);
    }
  }

  async function handleUnlink(linkId: string) {
    if (!confirm(t('ideas.unlink_confirm'))) {
      return;
    }

    const result = await unlinkIdeaFromProjectAction(linkId);

    if (result.success) {
      router.refresh();
    } else if (result.error) {
      alert(result.error);
    }
  }

  // Filter out projects that are already linked
  const linkedProjectIds = new Set(projectLinks.map((link) => link.project_id));
  const availableProjectsToLink = availableProjects.filter(
    (p) => !linkedProjectIds.has(p.id)
  );

  return (
    <div className="space-y-6">
      {/* Title and Description */}
      <div className="bg-white rounded-lg border p-6">
        {isEditing ? (
          <form action={handleUpdate} className="space-y-4">
            <div>
              <label htmlFor="title" className="block text-sm font-medium mb-2">
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
              <h1 className="text-3xl font-bold">{idea.title}</h1>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setIsEditing(true)}>
                  {t('common.edit')}
                </Button>
                <Button
                  variant="destructive"
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
            <div className="text-sm text-muted-foreground">
              <p>
                {t('ideas.created')}:{' '}
                {new Date(idea.created_at).toLocaleString()}
              </p>
              {idea.updated_at !== idea.created_at && (
                <p>
                  {t('ideas.updated')}:{' '}
                  {new Date(idea.updated_at).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
