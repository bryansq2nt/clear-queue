'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Database } from '@/lib/supabase/types';
import { useI18n } from '@/components/shared/I18nProvider';
import { getNotes, deleteNote, updateNote } from '@/app/actions/notes';
import {
  Plus,
  FileText,
  MoreVertical,
  Edit,
  Trash2,
  ExternalLink,
  ChevronLeft,
  Clock,
  FolderOpen,
  FolderPlus,
  Search,
  Square,
  Move,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CreateFolderDialog } from '@/components/context/notes/CreateFolderDialog';
import { ChooseFolderForNewNoteDialog } from '@/components/context/notes/ChooseFolderForNewNoteDialog';
import { MoveNotesToFolderDialog } from '@/components/context/notes/MoveNotesToFolderDialog';
import { cn } from '@/lib/utils';

type Note = Database['public']['Tables']['notes']['Row'];
type NoteFolder = Database['public']['Tables']['project_note_folders']['Row'];

const MAX_RECENT_NOTES = 5;

/** null = folder grid view; 'root' = notes without folder; string = folder id */
type SelectedFolder = null | 'root' | string;

function sortNotesByRecent(list: Note[]): Note[] {
  return [...list].sort((a, b) => {
    const aAt = a.last_opened_at ?? a.updated_at;
    const bAt = b.last_opened_at ?? b.updated_at;
    return new Date(bAt).getTime() - new Date(aAt).getTime();
  });
}

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
  initialFolders: NoteFolder[];
  onRefresh?: () => void | Promise<void>;
}

/**
 * Notes tab for context view — recently opened, folder grid, and folder view with note cards + search.
 */
export default function ContextNotesClient({
  projectId,
  initialNotes,
  initialFolders,
  onRefresh,
}: ContextNotesClientProps) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [folders, setFolders] = useState<NoteFolder[]>(initialFolders);
  const [selectedFolderId, setSelectedFolderId] =
    useState<SelectedFolder>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [isChooseFolderOpen, setIsChooseFolderOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(
    new Set()
  );
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);
  const [isMoving, setIsMoving] = useState(false);

  useEffect(() => {
    setNotes(initialNotes);
  }, [initialNotes]);

  useEffect(() => {
    setFolders(initialFolders);
  }, [initialFolders]);

  const notesInFolder = useMemo(() => {
    if (selectedFolderId === null) return notes;
    if (selectedFolderId === 'root')
      return notes.filter((n) => n.folder_id == null);
    return notes.filter((n) => n.folder_id === selectedFolderId);
  }, [notes, selectedFolderId]);

  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return notesInFolder;
    return notesInFolder.filter((n) => {
      const title = (n.title ?? '').toLowerCase();
      const content = (n.content ?? '').toLowerCase();
      return title.includes(q) || content.includes(q);
    });
  }, [notesInFolder, searchQuery]);

  const noteCountByFolder = useMemo(() => {
    const root = notes.filter((n) => n.folder_id == null).length;
    const byId: Record<string, number> = {};
    notes.forEach((n) => {
      if (n.folder_id) byId[n.folder_id] = (byId[n.folder_id] ?? 0) + 1;
    });
    return { root, byId };
  }, [notes]);

  const recentNotes = useMemo(
    () => sortNotesByRecent(notes).slice(0, MAX_RECENT_NOTES),
    [notes]
  );

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

  const handleCreateFolderSuccess = (folder: NoteFolder) => {
    setFolders((prev) =>
      [...prev, folder].sort((a, b) => a.sort_order - b.sort_order)
    );
    setSelectedFolderId(folder.id);
    void onRefresh?.();
  };

  const clearFilters = () => setSearchQuery('');
  const hasActiveSearch = searchQuery.trim() !== '';

  const listHref = `/context/${projectId}/notes`;
  const detailHref = (noteId: string) =>
    `/context/${projectId}/notes/${noteId}`;
  const newNoteHref =
    selectedFolderId && selectedFolderId !== 'root'
      ? `/context/${projectId}/notes/new?folderId=${selectedFolderId}`
      : `/context/${projectId}/notes/new`;

  const handleNewNoteClick = () => {
    if (selectedFolderId !== null) {
      router.push(newNoteHref);
      return;
    }
    setIsChooseFolderOpen(true);
  };

  const handleChooseFolder = (folderId: string | null) => {
    const url =
      folderId == null
        ? `/context/${projectId}/notes/new`
        : `/context/${projectId}/notes/new?folderId=${folderId}`;
    router.push(url);
  };

  const toggleNoteSelection = (noteId: string) => {
    setSelectedNoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) next.delete(noteId);
      else next.add(noteId);
      return next;
    });
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedNoteIds(new Set());
  };

  const handleMoveToFolder = async (targetFolderId: string | null) => {
    if (selectedNoteIds.size === 0) return;
    setIsMoving(true);
    for (const id of selectedNoteIds) {
      await updateNote(id, { folder_id: targetFolderId });
    }
    setIsMoving(false);
    exitSelectionMode();
    await loadNotes();
    void onRefresh?.();
  };

  const renderNoteCard = (
    note: Note,
    isRecentlyOpened = false,
    inSelectionMode = false,
    isSelected = false
  ) => (
    <div
      key={note.id}
      role="button"
      tabIndex={0}
      onClick={() => {
        if (inSelectionMode) toggleNoteSelection(note.id);
        else router.push(detailHref(note.id));
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          if (inSelectionMode) toggleNoteSelection(note.id);
          else router.push(detailHref(note.id));
        }
      }}
      className={cn(
        'bg-card rounded-lg border border-border p-5 hover:shadow-md transition-all cursor-pointer group relative',
        isRecentlyOpened && 'border-l-4 border-l-primary bg-primary/5',
        inSelectionMode && isSelected && 'ring-2 ring-primary'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {inSelectionMode && (
          <div
            className="flex items-center shrink-0 pt-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleNoteSelection(note.id)}
              aria-label={t('notes.select')}
              className="h-4 w-4 rounded border-border"
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-white truncate">
            {note.title}
          </h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            {formatUpdatedAt(note.updated_at, t, locale)}
          </p>
        </div>
        {isRecentlyOpened && (
          <Clock
            className="w-4 h-4 flex-shrink-0 text-primary"
            aria-label={t('notes.recently_opened_section')}
          />
        )}
        {!isRecentlyOpened && !inSelectionMode && (
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
        )}
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 min-h-full">
      {/* Recently opened — only on folder grid view */}
      {selectedFolderId === null && recentNotes.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-medium text-muted-foreground mb-2">
            {t('notes.recently_opened_section')}
          </h2>
          <div className="rounded-lg border border-border overflow-hidden bg-card">
            {recentNotes.map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => router.push(detailHref(note.id))}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-left border-b border-border last:border-b-0',
                  'hover:bg-muted/30 transition-colors',
                  'border-l-4 border-l-primary bg-primary/5'
                )}
              >
                <FileText className="w-5 h-5 flex-shrink-0 text-muted-foreground" />
                <span className="flex-1 min-w-0 truncate text-sm font-medium">
                  {note.title}
                </span>
                <Clock
                  className="w-4 h-4 flex-shrink-0 text-primary"
                  aria-label={t('notes.recently_opened_section')}
                />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Folder grid (landing view) */}
      {selectedFolderId === null && (
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              {t('notes.folders_section')}
            </h2>
            <button
              type="button"
              onClick={() => setIsCreateFolderOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
            >
              <FolderPlus className="w-4 h-4" />
              {t('notes.new_folder')}
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <button
              type="button"
              onClick={() => setSelectedFolderId('root')}
              className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 p-4 text-left hover:bg-muted/50 hover:border-primary/30 transition-colors"
            >
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
                <FolderOpen className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">
                  {t('notes.folder_no_folder')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('notes.notes_count', { count: noteCountByFolder.root })}
                </p>
              </div>
            </button>
            {folders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                onClick={() => setSelectedFolderId(folder.id)}
                className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 p-4 text-left hover:bg-muted/50 hover:border-primary/30 transition-colors"
              >
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
                  <FolderOpen className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{folder.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('notes.notes_count', {
                      count: noteCountByFolder.byId[folder.id] ?? 0,
                    })}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Inside folder: back, title, search, note grid */}
      {selectedFolderId !== null && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedFolderId(null);
                clearFilters();
                exitSelectionMode();
              }}
              className="gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" />
              {t('notes.back_to_folders')}
            </Button>
          </div>
          <h2 className="text-lg font-semibold mb-3">
            {selectedFolderId === 'root'
              ? t('notes.folder_no_folder')
              : (folders.find((f) => f.id === selectedFolderId)?.name ?? '')}
          </h2>

          {/* Search + Select / Move toolbar (inside folder) */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative flex-1 min-w-[180px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder={t('notes.search_placeholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
            {hasActiveSearch && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                {t('notes.clear_filters')}
              </Button>
            )}
            {!selectionMode ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectionMode(true)}
                className="gap-1.5"
              >
                <Square className="w-4 h-4" />
                {t('notes.select')}
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={exitSelectionMode}
                  className="gap-1.5"
                >
                  {t('notes.cancel_selection')}
                </Button>
                {selectedNoteIds.size > 0 && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => setIsMoveDialogOpen(true)}
                    disabled={isMoving}
                    className="gap-1.5"
                  >
                    <Move className="w-4 h-4" />
                    {t('notes.move_to_folder')} ({selectedNoteIds.size})
                  </Button>
                )}
              </>
            )}
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">
              {t('common.loading')}
            </p>
          ) : filteredNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 bg-card rounded-lg border border-border">
              <FileText className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-center mb-1">
                {hasActiveSearch
                  ? t('notes.no_notes_match')
                  : t('notes.no_notes_yet')}
              </p>
              {hasActiveSearch ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearFilters}
                  className="mt-4"
                >
                  {t('notes.clear_filters')}
                </Button>
              ) : (
                <button
                  type="button"
                  onClick={() => router.push(newNoteHref)}
                  className="text-sm font-medium text-primary hover:underline mt-4"
                >
                  {t('notes.new_note')}
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredNotes.map((note) =>
                renderNoteCard(
                  note,
                  false,
                  selectionMode,
                  selectedNoteIds.has(note.id)
                )
              )}
            </div>
          )}
        </>
      )}

      {/* FAB — new note (from folder grid opens choose-folder dialog first) */}
      <button
        type="button"
        onClick={handleNewNoteClick}
        aria-label={t('notes.new_note')}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background md:bottom-8 md:right-8"
      >
        <Plus className="h-6 w-6" />
      </button>

      <ChooseFolderForNewNoteDialog
        open={isChooseFolderOpen}
        folders={folders}
        onClose={() => setIsChooseFolderOpen(false)}
        onChoose={handleChooseFolder}
      />

      <MoveNotesToFolderDialog
        open={isMoveDialogOpen}
        folders={folders}
        selectedCount={selectedNoteIds.size}
        onClose={() => setIsMoveDialogOpen(false)}
        onMove={handleMoveToFolder}
      />

      <CreateFolderDialog
        open={isCreateFolderOpen}
        projectId={projectId}
        onClose={() => setIsCreateFolderOpen(false)}
        onSuccess={handleCreateFolderSuccess}
      />
    </div>
  );
}
