'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Database } from '@/lib/supabase/types';
import { useI18n } from '@/components/shared/I18nProvider';
import {
  getNotes,
  deleteNote,
  updateNote,
  deleteNotes,
} from '@/app/actions/notes';
import { deleteFolders } from '@/app/actions/note-folders';
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
  CheckSquare,
  X,
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
import { DeleteFoldersConfirmDialog } from '@/components/context/notes/DeleteFoldersConfirmDialog';
import { DeleteNotesConfirmDialog } from '@/components/context/notes/DeleteNotesConfirmDialog';
import { useContextDataCache } from '@/app/context/ContextDataCache';
import { useActionToast } from '@/components/shared/ActionToastProvider';
import { toastError } from '@/lib/ui/toast';
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
  /** When opening with ?folderId=xxx or ?folderId=root */
  initialFolderId?: string;
  onRefresh?: () => void | Promise<void>;
}

/**
 * Notes tab for context view — recently opened, folder grid, and folder view with note cards + search.
 */
export default function ContextNotesClient({
  projectId,
  initialNotes,
  initialFolders,
  initialFolderId,
  onRefresh,
}: ContextNotesClientProps) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const cache = useContextDataCache();
  const { showActionToast, dismiss } = useActionToast();
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [folders, setFolders] = useState<NoteFolder[]>(initialFolders);
  const [selectedFolderId, setSelectedFolderId] = useState<SelectedFolder>(
    () =>
      initialFolderId === undefined
        ? null
        : initialFolderId === 'root'
          ? 'root'
          : initialFolderId
  );
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
  const [isDeleteNotesOpen, setIsDeleteNotesOpen] = useState(false);
  const [isDeletingNotes, setIsDeletingNotes] = useState(false);

  // Persisted via sessionStorage so it survives navigation away and back.
  // null = never dismissed; number = timestamp of last dismiss.
  // The widget only re-appears for notes opened AFTER this timestamp.
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  // Folder (grid-view) multi-select state
  const [folderSelectionMode, setFolderSelectionMode] = useState(false);
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(
    new Set()
  );
  const [isDeleteFoldersOpen, setIsDeleteFoldersOpen] = useState(false);
  const [isDeletingFolders, setIsDeletingFolders] = useState(false);

  // Guards against stale initialFolderId overwriting client state after folder creation.
  // Set to the new folder's id in handleCreateFolderSuccess; cleared once the server
  // has caught up (initialFolderId === ref value) or the user returns to the grid.
  const lastCreatedFolderIdRef = useRef<string | null>(null);

  useEffect(() => {
    setNotes(initialNotes);
  }, [initialNotes]);

  // Sync selected folder when URL changes (e.g. after clicking "Ir" in the toast).
  // When the user returns to the grid (initialFolderId === undefined) we clear the ref
  // so future navigations are unaffected. When the server finally sends the correct
  // folderId (matches the just-created folder) we clear the ref and sync normally.
  // Any intermediate stale value (e.g. the previous move destination) is skipped.
  useEffect(() => {
    if (initialFolderId === undefined) {
      lastCreatedFolderIdRef.current = null;
      return;
    }
    if (
      lastCreatedFolderIdRef.current !== null &&
      initialFolderId !== lastCreatedFolderIdRef.current
    ) {
      // Server hasn't caught up yet — keep the client-selected folder.
      return;
    }
    lastCreatedFolderIdRef.current = null;
    setSelectedFolderId(initialFolderId === 'root' ? 'root' : initialFolderId);
  }, [initialFolderId]);

  useEffect(() => {
    setFolders(initialFolders);
  }, [initialFolders]);

  // Read the persisted dismiss timestamp on mount so the widget stays closed
  // after the user navigates away (e.g. opens a note) and returns.
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(`cq-notes-dismissed-${projectId}`);
      if (stored) setDismissedAt(parseInt(stored, 10));
    } catch {
      // sessionStorage unavailable (private mode with storage blocked, etc.)
    }
  }, [projectId]);

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

  // Only show notes that were opened AFTER the last dismiss.
  // When dismissedAt is null the widget was never dismissed — show all recent.
  const recentNotesFiltered = useMemo(() => {
    if (dismissedAt === null) return recentNotes;
    return recentNotes.filter(
      (n) =>
        n.last_opened_at != null &&
        new Date(n.last_opened_at).getTime() > dismissedAt
    );
  }, [recentNotes, dismissedAt]);

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
    // Set the ref before router.replace so the initialFolderId sync effect
    // ignores any stale RSC value that arrives before the server reflects the
    // new folder id.
    lastCreatedFolderIdRef.current = folder.id;
    setFolders((prev) =>
      [...prev, folder].sort((a, b) => a.sort_order - b.sort_order)
    );
    setSelectedFolderId(folder.id);
    router.replace(`/context/${projectId}/notes?folderId=${folder.id}`);
    // Invalidate only; do not call onRefresh() here so the re-render does not
    // run with stale initialFolderId from the URL (e.g. last move destination).
    cache.invalidate({ type: 'notes', projectId });
    cache.invalidate({ type: 'noteFolders', projectId });
  };

  const clearFilters = () => setSearchQuery('');
  const hasActiveSearch = searchQuery.trim() !== '';

  const handleDismissRecentNotes = () => {
    const now = Date.now();
    setDismissedAt(now);
    try {
      sessionStorage.setItem(`cq-notes-dismissed-${projectId}`, String(now));
    } catch {
      // ignore storage errors
    }
  };

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

  const exitFolderSelectionMode = () => {
    setFolderSelectionMode(false);
    setSelectedFolderIds(new Set());
  };

  const toggleFolderSelection = (folderId: string) => {
    setSelectedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const handleDeleteFolders = async () => {
    if (selectedFolderIds.size === 0) return;
    const ids = Array.from(selectedFolderIds);
    setIsDeletingFolders(true);
    const result = await deleteFolders(projectId, ids);
    setIsDeletingFolders(false);

    if (!result.success) {
      toastError(t('notes.delete_folders_error'));
      return;
    }

    // Optimistic update: remove deleted folders and unassign their notes locally.
    // Cache is also invalidated so the next tab visit refetches fresh data.
    const deletedSet = new Set(ids);
    setFolders((prev) => prev.filter((f) => !deletedSet.has(f.id)));
    setNotes((prev) =>
      prev.map((n) =>
        n.folder_id && deletedSet.has(n.folder_id)
          ? { ...n, folder_id: null }
          : n
      )
    );
    setIsDeleteFoldersOpen(false);
    exitFolderSelectionMode();
    cache.invalidate({ type: 'notes', projectId });
    cache.invalidate({ type: 'noteFolders', projectId });
  };

  const handleDeleteNotes = async () => {
    if (selectedNoteIds.size === 0) return;
    const ids = Array.from(selectedNoteIds);
    setIsDeletingNotes(true);
    const result = await deleteNotes(ids);
    setIsDeletingNotes(false);

    if (result.error) {
      toastError(t('notes.delete_notes_error'));
      return;
    }

    // Optimistic update: remove deleted notes from local state.
    // Cache is invalidated so the next visit refetches fresh data.
    const deletedSet = new Set(ids);
    setNotes((prev) => prev.filter((n) => !deletedSet.has(n.id)));
    setIsDeleteNotesOpen(false);
    exitSelectionMode();
    cache.invalidate({ type: 'notes', projectId });
  };

  const handleMoveToFolder = (targetFolderId: string | null) => {
    if (selectedNoteIds.size === 0) return;
    const previousFolderId: string | null =
      selectedFolderId === 'root' ? null : selectedFolderId;
    const moved = Array.from(selectedNoteIds).map((noteId) => ({
      noteId,
      previousFolderId,
    }));

    // Optimistic update + show toast immediately (no wait for server)
    setNotes((prev) =>
      prev.map((n) =>
        selectedNoteIds.has(n.id) ? { ...n, folder_id: targetFolderId } : n
      )
    );
    setIsMoveDialogOpen(false);
    exitSelectionMode();

    const folderName =
      targetFolderId == null
        ? t('notes.folder_no_folder')
        : (folders.find((f) => f.id === targetFolderId)?.name ?? '');
    const goHref =
      targetFolderId == null
        ? `/context/${projectId}/notes?folderId=root`
        : `/context/${projectId}/notes?folderId=${targetFolderId}`;

    showActionToast({
      message: t('notes.notes_moved_to', {
        count: moved.length,
        folderName,
      }),
      primaryAction: {
        label: t('toast.go'),
        href: goHref,
        // Also update client state directly so "Ir" works even when the current
        // URL already equals goHref (router.push would be a no-op in that case).
        onClick: () =>
          setSelectedFolderId(
            targetFolderId === null ? 'root' : targetFolderId
          ),
      },
      undoAction: {
        label: t('toast.undo'),
        onUndo: () => {
          // Optimistic revert: put notes back in their original folder.
          setNotes((prev) =>
            prev.map((n) => {
              const m = moved.find((x) => x.noteId === n.id);
              if (!m) return n;
              return { ...n, folder_id: m.previousFolderId };
            })
          );
          // Show confirmation — dismiss() was already called in ActionToastProvider
          // before onUndo(), so this new toast will not be immediately cleared.
          showActionToast({ message: t('notes.move_undone') });
          // Server writes in background.
          // We intentionally do NOT call cache.invalidate here: the session cache
          // already holds the pre-move notes (it was never updated after the move),
          // so it is already correct after the undo.  Calling invalidate would
          // trigger a skeleton re-render that resets selectedFolderId and kicks
          // the user out of the current folder.
          void (async () => {
            for (const { noteId, previousFolderId: prev } of moved) {
              await updateNote(noteId, { folder_id: prev });
            }
          })();
        },
      },
    });

    // Server updates in background; on failure revert and dismiss toast
    void (async () => {
      for (const { noteId } of moved) {
        const { error } = await updateNote(noteId, {
          folder_id: targetFolderId,
        });
        if (error) {
          setNotes((prev) =>
            prev.map((n) => {
              const m = moved.find((x) => x.noteId === n.id);
              if (!m) return n;
              return { ...n, folder_id: m.previousFolderId };
            })
          );
          toastError(t('notes.move_error'));
          dismiss();
          return;
        }
      }
    })();
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
      {/* Recently opened — only on folder grid view, only for notes opened after last dismiss */}
      {selectedFolderId === null && recentNotesFiltered.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              {t('notes.recently_opened_section')}
            </h2>
            <button
              type="button"
              onClick={handleDismissRecentNotes}
              aria-label={t('notes.dismiss_recently_opened')}
              className="rounded p-1 hover:bg-muted text-muted-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="rounded-lg border border-border overflow-hidden bg-card">
            {recentNotesFiltered.map((note) => (
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
          {!folderSelectionMode ? (
            /* Normal header: label + "Select" + "New folder" */
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-muted-foreground">
                {t('notes.folders_section')}
              </h2>
              <div className="flex items-center gap-2">
                {folders.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setFolderSelectionMode(true)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
                  >
                    <CheckSquare className="w-4 h-4" />
                    {t('notes.folder_select_mode')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsCreateFolderOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
                >
                  <FolderPlus className="w-4 h-4" />
                  {t('notes.new_folder')}
                </button>
              </div>
            </div>
          ) : (
            /* Selection-mode header: cancel + select-all + delete */
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <Button
                variant="ghost"
                size="sm"
                onClick={exitFolderSelectionMode}
                className="gap-1.5"
              >
                {t('notes.folder_selection_cancel')}
              </Button>
              <div className="flex items-center gap-2 ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const allSelected = folders.every((f) =>
                      selectedFolderIds.has(f.id)
                    );
                    if (allSelected) {
                      setSelectedFolderIds(new Set());
                    } else {
                      setSelectedFolderIds(new Set(folders.map((f) => f.id)));
                    }
                  }}
                  className="gap-1.5"
                >
                  {folders.every((f) => selectedFolderIds.has(f.id))
                    ? t('notes.folder_deselect_all')
                    : t('notes.folder_select_all')}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={selectedFolderIds.size === 0}
                  onClick={() => setIsDeleteFoldersOpen(true)}
                  className="gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  {t('notes.folder_delete_selected', {
                    count: selectedFolderIds.size,
                  })}
                </Button>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* "No folder" virtual folder — never selectable for deletion */}
            <button
              type="button"
              onClick={() => {
                if (folderSelectionMode) return;
                setSelectedFolderId('root');
              }}
              className={cn(
                'flex items-center gap-4 rounded-lg border border-border bg-muted/30 p-4 text-left hover:bg-muted/50 hover:border-primary/30 transition-colors',
                folderSelectionMode && 'opacity-40 cursor-default'
              )}
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

            {/* Named folders */}
            {folders.map((folder) => {
              const isSelected = selectedFolderIds.has(folder.id);
              return (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => {
                    if (folderSelectionMode) {
                      toggleFolderSelection(folder.id);
                    } else {
                      setSelectedFolderId(folder.id);
                    }
                  }}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-4 text-left hover:bg-muted/50 hover:border-primary/30 transition-colors',
                    folderSelectionMode &&
                      isSelected &&
                      'ring-2 ring-destructive border-destructive/40 bg-destructive/5'
                  )}
                >
                  {folderSelectionMode && (
                    <div
                      className="flex items-center shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleFolderSelection(folder.id)}
                        aria-label={folder.name}
                        className="h-4 w-4 rounded border-border"
                      />
                    </div>
                  )}
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
              );
            })}
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
                exitFolderSelectionMode();
                router.replace(`/context/${projectId}/notes`);
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
                {filteredNotes.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const allSelected = filteredNotes.every((n) =>
                        selectedNoteIds.has(n.id)
                      );
                      if (allSelected) {
                        const ids = new Set(filteredNotes.map((n) => n.id));
                        setSelectedNoteIds(
                          (prev) =>
                            new Set([...prev].filter((id) => !ids.has(id)))
                        );
                      } else {
                        setSelectedNoteIds(
                          (prev) =>
                            new Set([
                              ...prev,
                              ...filteredNotes.map((n) => n.id),
                            ])
                        );
                      }
                    }}
                    className="gap-1.5"
                  >
                    {filteredNotes.every((n) => selectedNoteIds.has(n.id))
                      ? t('notes.deselect_all')
                      : t('notes.select_all')}
                  </Button>
                )}
                {selectedNoteIds.size > 0 && (
                  <>
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
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setIsDeleteNotesOpen(true)}
                      className="gap-1.5"
                    >
                      <Trash2 className="w-4 h-4" />
                      {t('notes.bulk_delete')} ({selectedNoteIds.size})
                    </Button>
                  </>
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

      {/* FAB — multi-select: menu (3 dots); otherwise new note */}
      {selectionMode && selectedNoteIds.size > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t('notes.multi_actions')}
              className={cn(
                'fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-lg',
                'bg-secondary text-secondary-foreground transition-transform hover:scale-105',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background',
                'md:bottom-8 md:right-8'
              )}
            >
              <MoreVertical className="h-6 w-6" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="min-w-[180px]">
            <DropdownMenuItem onClick={() => setIsMoveDialogOpen(true)}>
              <FolderOpen className="w-4 h-4 mr-2" />
              {t('notes.move_to_folder')} ({selectedNoteIds.size})
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setIsDeleteNotesOpen(true)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {t('notes.bulk_delete')} ({selectedNoteIds.size})
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <button
          type="button"
          onClick={handleNewNoteClick}
          aria-label={t('notes.new_note')}
          className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background md:bottom-8 md:right-8"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

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
        projectId={projectId}
        currentFolderId={selectedFolderId}
        onClose={() => setIsMoveDialogOpen(false)}
        onMove={handleMoveToFolder}
        onFolderCreated={(folder) => setFolders((prev) => [...prev, folder])}
      />

      <DeleteNotesConfirmDialog
        open={isDeleteNotesOpen}
        noteCount={selectedNoteIds.size}
        isAllNotesInFolder={
          notesInFolder.length > 0 &&
          selectedNoteIds.size === notesInFolder.length
        }
        isDeleting={isDeletingNotes}
        onConfirm={() => void handleDeleteNotes()}
        onCancel={() => setIsDeleteNotesOpen(false)}
      />

      <DeleteFoldersConfirmDialog
        open={isDeleteFoldersOpen}
        folderCount={selectedFolderIds.size}
        isAllFolders={
          folders.length > 0 && selectedFolderIds.size === folders.length
        }
        isDeleting={isDeletingFolders}
        onConfirm={() => void handleDeleteFolders()}
        onCancel={() => setIsDeleteFoldersOpen(false)}
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
