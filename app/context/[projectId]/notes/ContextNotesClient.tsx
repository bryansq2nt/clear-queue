'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Database } from '@/lib/supabase/types';
import { useI18n } from '@/components/I18nProvider';
import { getNotes, deleteNote } from '@/app/notes/actions';
import {
  Plus,
  FileText,
  MoreVertical,
  Edit,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type Note = Database['public']['Tables']['notes']['Row'];

function formatUpdatedAt(
  iso: string,
  t: (key: string, params?: Record<string, string | number>) => string,
  locale: string
): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const localeTag = locale === 'es' ? 'es-MX' : 'en-US';
  if (diffDays === 0)
    return d.toLocaleTimeString(localeTag, {
      hour: '2-digit',
      minute: '2-digit',
    });
  if (diffDays === 1) return t('notes.yesterday');
  if (diffDays < 7) return t('notes.days_ago', { count: diffDays });
  return d.toLocaleDateString(localeTag);
}

interface ContextNotesClientProps {
  projectId: string;
  initialNotes: Note[];
  /** When provided (context cache), used instead of local fetch for refresh */
  onRefresh?: () => void | Promise<void>;
}

/**
 * Notes tab for context view — project-scoped notes list.
 * Reuses same card UI as module notes; links go to context detail/new.
 */
export default function ContextNotesClient({
  projectId,
  initialNotes,
  onRefresh,
}: ContextNotesClientProps) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setNotes(initialNotes);
  }, [initialNotes]);

  const loadNotes = async () => {
    if (onRefresh) {
      setIsLoading(true);
      await onRefresh();
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const data = await getNotes({ projectId });
    setNotes(data);
    setIsLoading(false);
  };

  const handleDelete = async (e: React.MouseEvent, note: Note) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(t('notes.delete_confirm', { title: note.title }))) return;
    const { error } = await deleteNote(note.id);
    if (error) {
      alert(error);
      return;
    }
    loadNotes();
  };

  const listHref = `/context/${projectId}/notes`;
  const detailHref = (noteId: string) =>
    `/context/${projectId}/notes/${noteId}`;

  return (
    <div className="p-4 md:p-6 min-h-full">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 bg-card rounded-lg border border-border">
          <FileText className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground text-center mb-4">
            {t('notes.no_notes_yet')}
          </p>
          <button
            type="button"
            onClick={() => router.push(`/context/${projectId}/notes/new`)}
            className="text-sm font-medium text-primary hover:underline"
          >
            {t('notes.new_note')}
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((note) => (
            <div
              key={note.id}
              role="button"
              tabIndex={0}
              onClick={() => router.push(detailHref(note.id))}
              onKeyDown={(e) =>
                e.key === 'Enter' && router.push(detailHref(note.id))
              }
              className="bg-card rounded-lg border border-border p-5 hover:shadow-md transition-all cursor-pointer group relative"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                    {note.title}
                  </h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    {formatUpdatedAt(note.updated_at, t, locale)}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className="p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <MoreVertical className="w-4 h-4 text-gray-500" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenuItem
                      onClick={() => router.push(detailHref(note.id))}
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      {t('notes.view')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => router.push(detailHref(note.id))}
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      {t('notes.edit')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => handleDelete(e, note)}
                      className="text-red-600 focus:text-red-600"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      {t('common.delete')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      )}

      {notes.length > 0 && (
        <button
          type="button"
          onClick={() => router.push(`/context/${projectId}/notes/new`)}
          aria-label={t('notes.new_note')}
          className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background md:bottom-8 md:right-8"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}
