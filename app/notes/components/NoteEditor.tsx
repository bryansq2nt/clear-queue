'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/I18nProvider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  createNote,
  updateNote,
  deleteNote,
  addNoteLink,
  deleteNoteLink,
} from '@/app/notes/actions';
import { getProjects } from '@/app/budgets/actions';
import { Link2, Plus, Trash2, Check, Save } from 'lucide-react';
import { Database } from '@/lib/supabase/types';

type NoteLink = Database['public']['Tables']['note_links']['Row'];

export type LocalLink = { id: string; title?: string; url: string };

const AUTOSAVE_DELAY_MS = 1500;
const MIN_VALID_URL = (url: string) => {
  const u = url.trim();
  return u.length > 0 && (u.startsWith('http://') || u.startsWith('https://'));
};

export interface NoteEditorProps {
  mode: 'create' | 'edit';
  noteId?: string;
  initialNote: { title: string; content: string; project_id: string };
  initialLinks: NoteLink[] | LocalLink[];
  preselectedProjectId?: string | null;
  /** When provided (e.g. context view), redirect here after delete instead of /notes */
  listHref?: string;
  /** When provided (e.g. context view), redirect here after create instead of /notes/[id] */
  getDetailHref?: (noteId: string) => string;
  /** When true (e.g. context view), hide the toolbar and show Delete as a FAB like Link/Save */
  deleteAsFab?: boolean;
  /** Called after a successful save (e.g. to invalidate cache) */
  onSaveSuccess?: () => void;
  /** Called after a successful delete, before redirect (e.g. to invalidate cache) */
  onDeleteSuccess?: () => void;
}

export function NoteEditor({
  mode,
  noteId,
  initialNote,
  initialLinks,
  preselectedProjectId,
  listHref,
  getDetailHref,
  deleteAsFab = false,
  onSaveSuccess,
  onDeleteSuccess,
}: NoteEditorProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [title, setTitle] = useState(initialNote.title);
  const [content, setContent] = useState(initialNote.content);
  const [projectId, setProjectId] = useState(
    initialNote.project_id || preselectedProjectId || ''
  );
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [links, setLinks] = useState<(NoteLink | LocalLink)[]>(initialLinks);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>(
    'idle'
  );
  const [error, setError] = useState<string | null>(null);
  const [showAddLink, setShowAddLink] = useState(false);
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const lastSavedRef = useRef<{
    title: string;
    content: string;
    project_id: string;
  }>(initialNote);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isEdit = mode === 'edit';

  const loadProjects = useCallback(async () => {
    const list = await getProjects();
    setProjects(list);
    if (
      preselectedProjectId &&
      list.some((p) => p.id === preselectedProjectId)
    ) {
      setProjectId((prev) => prev || preselectedProjectId!);
    }
  }, [preselectedProjectId]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    setTitle(initialNote.title);
    setContent(initialNote.content);
    setProjectId(initialNote.project_id || preselectedProjectId || '');
    setLinks(initialLinks);
    lastSavedRef.current = initialNote;
  }, [initialNote, initialLinks, preselectedProjectId]);

  const hasChanges = useCallback(() => {
    const t = title.trim();
    const c = content;
    const p = projectId;
    const last = lastSavedRef.current;
    return t !== last.title || c !== last.content || p !== last.project_id;
  }, [title, content, projectId]);

  const performSave = useCallback(async () => {
    if (!isEdit || !noteId) return;
    setError(null);
    setSaveStatus('saving');
    const result = await updateNote(noteId, {
      title: title.trim(),
      content,
      project_id: projectId,
    });
    setSaving(false);
    setSaveStatus(result.error ? 'idle' : 'saved');
    if (result.error) {
      setError(result.error);
      return;
    }
    lastSavedRef.current = {
      title: title.trim(),
      content,
      project_id: projectId,
    };
    onSaveSuccess?.();
    router.refresh();
    setTimeout(() => setSaveStatus('idle'), 2000);
  }, [isEdit, noteId, title, content, projectId, router, onSaveSuccess]);

  useEffect(() => {
    if (!isEdit || !noteId) return;
    if (!hasChanges()) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      performSave();
      autosaveTimerRef.current = null;
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [title, content, projectId, isEdit, noteId, hasChanges, performSave]);

  const handleSaveClick = async () => {
    if (isEdit) {
      await performSave();
      return;
    }
    setError(null);
    setSaving(true);
    if (!projectId) {
      setError(t('notes.error_select_project'));
      setSaving(false);
      return;
    }
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError(t('notes.error_title_required'));
      setSaving(false);
      return;
    }
    const result = await createNote({
      project_id: projectId,
      title: trimmedTitle,
      content: content ?? '',
    });
    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }
    const newId = result.data!.id;
    for (const link of links as LocalLink[]) {
      const url = link.url.trim();
      if (!url || !MIN_VALID_URL(url)) continue;
      await addNoteLink(newId, { title: link.title?.trim() || null, url });
    }
    setSaving(false);
    router.push(getDetailHref?.(newId) ?? `/notes/${newId}`);
  };

  const handleDelete = async () => {
    if (!isEdit || !noteId) return;
    if (!confirm(t('notes.delete_note_confirm'))) return;
    const { error: err } = await deleteNote(noteId);
    if (err) alert(err);
    else {
      onDeleteSuccess?.();
      router.push(listHref ?? '/notes');
    }
  };

  const addLink = (e: React.FormEvent) => {
    e.preventDefault();
    const url = newLinkUrl.trim();
    if (!url) return;
    if (!MIN_VALID_URL(url)) {
      setError(t('notes.error_invalid_url'));
      return;
    }
    setError(null);
    if (isEdit && noteId) {
      addNoteLink(noteId, { title: newLinkTitle.trim() || null, url }).then(
        (res) => {
          if (res.data) setLinks((prev) => [...prev, res.data!]);
          if (res.error) setError(res.error);
          else router.refresh();
        }
      );
    } else {
      setLinks((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          title: newLinkTitle.trim() || undefined,
          url,
        },
      ]);
    }
    setNewLinkTitle('');
    setNewLinkUrl('');
    setShowAddLink(false);
  };

  const removeLink = (link: NoteLink | LocalLink) => {
    if ('note_id' in link && link.note_id) {
      deleteNoteLink(link.id).then(() =>
        setLinks((prev) => prev.filter((l) => l.id !== link.id))
      );
      router.refresh();
    } else {
      setLinks((prev) => prev.filter((l) => l.id !== link.id));
    }
  };

  const linkHref = (url: string) =>
    url.startsWith('http') ? url : `https://${url}`;
  const linkLabel = (link: NoteLink | LocalLink) =>
    link.title && link.title.trim() ? link.title.trim() : link.url;

  const selectedProjectName =
    projects.find((p) => p.id === projectId)?.name ??
    t('notes.project_placeholder');

  return (
    <div className="max-w-6xl mx-auto w-full">
      {/* Minimal toolbar: only in edit mode when not deleteAsFab (saved + delete) */}
      {isEdit && !deleteAsFab && (
        <div className="sticky top-0 z-10 bg-slate-50/95 dark:bg-gray-900/95 backdrop-blur border-b border-slate-200 dark:border-gray-700 -mx-4 px-4 py-3 flex flex-wrap items-center justify-end gap-3">
          {saveStatus === 'saved' && (
            <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <Check className="w-3.5 h-3.5" />
              {t('notes.saved')}
            </span>
          )}
          {noteId && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleDelete}
              className="text-red-600 hover:text-red-700 border-red-200 dark:border-red-800"
            >
              {t('common.delete')}
            </Button>
          )}
        </div>
      )}

      {/* FAB Delete (when deleteAsFab, same style as Link/Save) */}
      {isEdit && noteId && deleteAsFab && (
        <button
          type="button"
          onClick={handleDelete}
          aria-label={t('common.delete')}
          title={t('common.delete')}
          className="fixed bottom-[10.5rem] right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-destructive focus:ring-offset-2 focus:ring-offset-background md:bottom-[12rem] md:right-8"
        >
          <Trash2 className="h-6 w-6" />
        </button>
      )}

      {/* FAB Project (link project) - above Save */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t('notes.link_project')}
            title={selectedProjectName}
            className="fixed bottom-24 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary/90 text-primary-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background md:bottom-[7rem] md:right-8"
          >
            <Link2 className="h-6 w-6" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          side="top"
          className="max-h-[min(60vh,320px)] overflow-y-auto"
        >
          {projects.map((p) => (
            <DropdownMenuItem
              key={p.id}
              onClick={() => setProjectId(p.id)}
              className="flex items-center justify-between gap-2"
            >
              <span className={projectId === p.id ? 'font-medium' : ''}>
                {p.name}
              </span>
              {projectId === p.id ? (
                <Check className="w-4 h-4 shrink-0" />
              ) : null}
            </DropdownMenuItem>
          ))}
          {projects.length === 0 && (
            <DropdownMenuItem disabled>{t('common.loading')}</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* FAB Save */}
      <button
        type="button"
        onClick={handleSaveClick}
        disabled={saving}
        aria-label={isEdit ? t('common.save') : t('notes.create_note')}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 md:bottom-8 md:right-8"
      >
        <Save className="h-6 w-6" />
      </button>

      {error && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 lg:gap-10 pt-6">
        {/* Main: title + content */}
        <div className="min-w-0">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('notes.title_placeholder')}
            className="w-full text-2xl lg:text-3xl font-semibold bg-transparent border-0 border-b border-transparent focus:border-slate-300 dark:focus:border-gray-600 focus:outline-none focus:ring-0 pb-2 text-gray-900 dark:text-white placeholder:text-slate-400"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t('notes.content_placeholder')}
            className="mt-6 w-full min-h-[60vh] resize-y bg-transparent border-0 focus:outline-none focus:ring-0 text-base leading-relaxed text-gray-900 dark:text-white placeholder:text-slate-400 py-0"
            style={{ minHeight: '60vh' }}
          />
        </div>

        {/* Right: Links & references (sidebar on desktop, collapsible on mobile) */}
        <div className="lg:pl-4 lg:border-l border-slate-200 dark:border-gray-700">
          <div className="lg:sticky lg:top-[4.5rem]">
            <details className="group lg:block" open>
              <summary className="lg:list-none lg:pointer-events-none cursor-pointer list-none flex items-center gap-2 mb-4 text-sm font-semibold text-slate-700 dark:text-slate-300 [&::-webkit-details-marker]:hidden">
                <Link2 className="w-4 h-4 flex-shrink-0" />
                {t('notes.links_section')}
                <span className="lg:hidden ml-1 opacity-70 group-open:rotate-180">
                  ▼
                </span>
              </summary>
              {showAddLink ? (
                <form
                  onSubmit={addLink}
                  className="space-y-2 p-3 rounded-lg bg-slate-100 dark:bg-gray-800 mb-4"
                >
                  <Input
                    value={newLinkTitle}
                    onChange={(e) => setNewLinkTitle(e.target.value)}
                    placeholder={t('notes.link_label_placeholder')}
                    className="text-sm"
                  />
                  <Input
                    value={newLinkUrl}
                    onChange={(e) => setNewLinkUrl(e.target.value)}
                    placeholder={t('notes.link_url_placeholder')}
                    type="url"
                    className="text-sm"
                  />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm">
                      {t('notes.add')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setShowAddLink(false);
                        setNewLinkTitle('');
                        setNewLinkUrl('');
                      }}
                    >
                      {t('common.cancel')}
                    </Button>
                  </div>
                </form>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddLink(true)}
                  className="mb-4"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  {t('notes.add_link')}
                </Button>
              )}
              {links.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t('notes.no_links_yet')}
                </p>
              ) : (
                <ul className="space-y-2">
                  {links.map((link) => (
                    <li key={link.id} className="flex items-center gap-2 group">
                      <a
                        href={linkHref(link.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 min-w-0 truncate text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {linkLabel(link)}
                      </a>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 text-red-600 hover:text-red-700 h-8 w-8 p-0 flex-shrink-0"
                        onClick={() => removeLink(link)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}
