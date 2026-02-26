'use client';

import { useEffect, useMemo, useState } from 'react';
import { Database } from '@/lib/supabase/types';
import { useI18n } from '@/components/shared/I18nProvider';
import {
  getDocuments,
  archiveDocument,
  deleteDocument,
  deleteDocuments,
  touchDocument,
  updateDocument,
} from '@/app/actions/documents';
import { deleteFolders } from '@/app/actions/document-folders';
import { DocumentRow } from '@/components/context/documents/DocumentRow';
import { UploadDocumentDialog } from '@/components/context/documents/UploadDocumentDialog';
import { EditDocumentDialog } from '@/components/context/documents/EditDocumentDialog';
import { CreateFolderDialog } from '@/components/context/documents/CreateFolderDialog';
import { DeleteFoldersConfirmDialog } from '@/components/context/documents/DeleteFoldersConfirmDialog';
import { DeleteDocumentsConfirmDialog } from '@/components/context/documents/DeleteDocumentsConfirmDialog';
import { MoveDocumentsToFolderDialog } from '@/components/context/documents/MoveDocumentsToFolderDialog';
import {
  CheckSquare,
  ChevronLeft,
  Clock,
  FileText,
  FolderOpen,
  FolderPlus,
  Move,
  Plus,
  Search,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { DOCUMENT_CATEGORY_VALUES } from '@/lib/validation/project-documents';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useContextDataCache } from '@/app/context/ContextDataCache';
import { useActionToast } from '@/components/shared/ActionToastProvider';
import { toastError } from '@/lib/ui/toast';

type ProjectFile = Database['public']['Tables']['project_files']['Row'];
type DocumentFolder =
  Database['public']['Tables']['project_document_folders']['Row'];

const MAX_RECENT_DOCUMENTS = 5;

function sortDocumentsForDisplay(list: ProjectFile[]): ProjectFile[] {
  if (list.length <= MAX_RECENT_DOCUMENTS) return list;
  const byRecent = [...list].sort((a, b) => {
    const aAt = a.last_opened_at ?? a.created_at;
    const bAt = b.last_opened_at ?? b.created_at;
    return new Date(bAt).getTime() - new Date(aAt).getTime();
  });
  const recentIds = new Set(
    byRecent.slice(0, MAX_RECENT_DOCUMENTS).map((d) => d.id)
  );
  const recent = byRecent.slice(0, MAX_RECENT_DOCUMENTS);
  const rest = list
    .filter((d) => !recentIds.has(d.id))
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  return [...recent, ...rest];
}

/** null = browse folder cards; 'root' = docs without folder; string = folder id */
type SelectedFolder = null | 'root' | string;

interface ContextDocumentsClientProps {
  projectId: string;
  initialDocuments: ProjectFile[];
  initialFolders: DocumentFolder[];
  onRefresh?: () => void | Promise<void>;
}

export default function ContextDocumentsClient({
  projectId,
  initialDocuments,
  initialFolders,
  onRefresh,
}: ContextDocumentsClientProps) {
  const { t } = useI18n();
  const cache = useContextDataCache();
  const { showActionToast, dismiss } = useActionToast();

  // ─── Data ────────────────────────────────────────────────────────────────
  const [documents, setDocuments] = useState<ProjectFile[]>(initialDocuments);
  const [folders, setFolders] = useState<DocumentFolder[]>(initialFolders);
  const [selectedFolderId, setSelectedFolderId] =
    useState<SelectedFolder>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterTags, setFilterTags] = useState<string[]>([]);

  // ─── Dialog / upload state ───────────────────────────────────────────────
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProjectFile | null>(null);

  // ─── Phase 1: recently-opened dismiss (persisted via sessionStorage) ─────
  // null = never dismissed; number = timestamp of last dismiss.
  // Widget only reappears for docs opened AFTER this timestamp.
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  // ─── Phase 3: folder multi-select ────────────────────────────────────────
  const [folderSelectionMode, setFolderSelectionMode] = useState(false);
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(
    new Set()
  );
  const [isDeleteFoldersOpen, setIsDeleteFoldersOpen] = useState(false);
  const [isDeletingFolders, setIsDeletingFolders] = useState(false);

  // ─── Phase 4: document multi-select + move + delete ─────────────────────
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(
    new Set()
  );
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);
  const [isDeleteDocsOpen, setIsDeleteDocsOpen] = useState(false);
  const [isDeletingDocs, setIsDeletingDocs] = useState(false);

  // ─── Sync initial props ──────────────────────────────────────────────────
  useEffect(() => {
    setDocuments(initialDocuments);
  }, [initialDocuments]);

  useEffect(() => {
    setFolders(initialFolders);
  }, [initialFolders]);

  // Phase 1: read persisted dismiss timestamp on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(`cq-docs-dismissed-${projectId}`);
      if (stored) setDismissedAt(parseInt(stored, 10));
    } catch {
      // sessionStorage unavailable (private mode with storage blocked, etc.)
    }
  }, [projectId]);

  // ─── Memos ───────────────────────────────────────────────────────────────
  const filteredByFolder = useMemo(() => {
    if (selectedFolderId === null) return documents;
    if (selectedFolderId === 'root')
      return documents.filter((d) => d.folder_id == null);
    return documents.filter((d) => d.folder_id === selectedFolderId);
  }, [documents, selectedFolderId]);

  const docCountByFolder = useMemo(() => {
    const root = documents.filter((d) => d.folder_id == null).length;
    const byId: Record<string, number> = {};
    documents.forEach((d) => {
      if (d.folder_id) byId[d.folder_id] = (byId[d.folder_id] ?? 0) + 1;
    });
    return { root, byId };
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    let list = filteredByFolder;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((d) => {
        const title = (d.title ?? '').toLowerCase();
        const desc = (d.description ?? '').toLowerCase();
        const tagStr = (d.tags ?? []).join(' ').toLowerCase();
        return title.includes(q) || desc.includes(q) || tagStr.includes(q);
      });
    }
    if (filterCategory) {
      list = list.filter((d) => d.document_category === filterCategory);
    }
    if (filterTags.length > 0) {
      list = list.filter((d) => {
        const docTags = new Set((d.tags ?? []).map((t) => t.toLowerCase()));
        return filterTags.every((t) => docTags.has(t.toLowerCase()));
      });
    }
    return list;
  }, [filteredByFolder, searchQuery, filterCategory, filterTags]);

  const allTagsFromDocuments = useMemo(() => {
    const set = new Set<string>();
    documents.forEach((d) => (d.tags ?? []).forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [documents]);

  const hasActiveFilters =
    searchQuery.trim() !== '' || filterCategory !== '' || filterTags.length > 0;

  const displayList = useMemo(
    () => sortDocumentsForDisplay(filteredDocuments),
    [filteredDocuments]
  );

  // Phase 1: recently-opened list, filtered by dismiss timestamp.
  // Computed from ALL documents (not filtered) so it isn't affected by
  // search/category state while the grid view is showing.
  const recentDocsFiltered = useMemo(() => {
    const recent = sortDocumentsForDisplay(documents).slice(
      0,
      MAX_RECENT_DOCUMENTS
    );
    if (dismissedAt === null) return recent;
    return recent.filter(
      (d) =>
        d.last_opened_at != null &&
        new Date(d.last_opened_at).getTime() > dismissedAt
    );
  }, [documents, dismissedAt]);

  /** Group filtered docs by folder for possible future use. */
  const groupedByFolder = useMemo(() => {
    const root: ProjectFile[] = [];
    const byFolder: Record<string, ProjectFile[]> = {};
    const sorted = sortDocumentsForDisplay(filteredDocuments);
    sorted.forEach((d) => {
      if (d.folder_id == null) root.push(d);
      else {
        if (!byFolder[d.folder_id]) byFolder[d.folder_id] = [];
        byFolder[d.folder_id].push(d);
      }
    });
    return { root, byFolder };
  }, [filteredDocuments]);

  // ─── Helpers ─────────────────────────────────────────────────────────────
  const clearFilters = () => {
    setSearchQuery('');
    setFilterCategory('');
    setFilterTags([]);
  };

  const refresh = async () => {
    if (onRefresh) {
      await onRefresh();
      return;
    }
    const data = await getDocuments(projectId);
    setDocuments(data);
  };

  // ─── Phase 1: dismiss recently-opened widget ─────────────────────────────
  const handleDismissRecentDocs = () => {
    const now = Date.now();
    setDismissedAt(now);
    try {
      sessionStorage.setItem(`cq-docs-dismissed-${projectId}`, String(now));
    } catch {
      // ignore storage errors
    }
  };

  // ─── Upload / edit / archive / delete ────────────────────────────────────
  const handleUploadSuccess = (fileOrFiles: ProjectFile | ProjectFile[]) => {
    setIsUploadOpen(false);
    const next = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
    setDocuments((prev) => [...next, ...prev]);
    void onRefresh?.();
  };

  // Phase 2: create folder → open it immediately; invalidate cache without reload
  const handleCreateFolderSuccess = (folder: DocumentFolder) => {
    setFolders((prev) =>
      [...prev, folder].sort((a, b) => a.sort_order - b.sort_order)
    );
    setSelectedFolderId(folder.id);
    cache.invalidate({ type: 'documentFolders', projectId });
  };

  const handleEditSuccess = (updated: ProjectFile) => {
    setEditTarget(null);
    setDocuments((prev) =>
      prev.map((d) => (d.id === updated.id ? updated : d))
    );
    void onRefresh?.();
  };

  const handleArchive = async (file: ProjectFile) => {
    const { success } = await archiveDocument(file.id);
    if (success) {
      setDocuments((prev) => prev.filter((d) => d.id !== file.id));
      void onRefresh?.();
    }
  };

  const handleDelete = async (file: ProjectFile) => {
    const { success } = await deleteDocument(file.id);
    if (success) {
      setDocuments((prev) => prev.filter((d) => d.id !== file.id));
      void onRefresh?.();
    }
  };

  const handleFinalToggle = (file: ProjectFile, isFinal: boolean) => {
    setDocuments((prev) =>
      prev.map((d) => (d.id === file.id ? { ...d, is_final: isFinal } : d))
    );
  };

  const handleDocumentOpened = (file: ProjectFile) => {
    void touchDocument(file.id);
    setDocuments((prev) =>
      sortDocumentsForDisplay(
        prev.map((d) =>
          d.id === file.id
            ? { ...d, last_opened_at: new Date().toISOString() }
            : d
        )
      )
    );
  };

  const openDoc = (file: ProjectFile) => {
    window.open(
      `/api/documents/${file.id}/view`,
      '_blank',
      'noopener,noreferrer'
    );
    handleDocumentOpened(file);
  };

  // ─── Phase 3: folder selection handlers ──────────────────────────────────
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
      toastError(t('documents.delete_folders_error'));
      return;
    }

    // Optimistic update: remove deleted folders; unassign their documents locally.
    const deletedSet = new Set(ids);
    setFolders((prev) => prev.filter((f) => !deletedSet.has(f.id)));
    setDocuments((prev) =>
      prev.map((d) =>
        d.folder_id && deletedSet.has(d.folder_id)
          ? { ...d, folder_id: null }
          : d
      )
    );
    setIsDeleteFoldersOpen(false);
    exitFolderSelectionMode();
    cache.invalidate({ type: 'documents', projectId });
    cache.invalidate({ type: 'documentFolders', projectId });
  };

  // ─── Phase 4: document selection + move handlers ─────────────────────────
  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedDocumentIds(new Set());
  };

  const toggleDocumentSelection = (docId: string) => {
    setSelectedDocumentIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const handleMoveToFolder = (targetFolderId: string | null) => {
    if (selectedDocumentIds.size === 0) return;
    const previousFolderId: string | null =
      selectedFolderId === 'root' ? null : selectedFolderId;
    const moved = Array.from(selectedDocumentIds).map((docId) => ({
      docId,
      previousFolderId,
    }));

    // Optimistic update
    setDocuments((prev) =>
      prev.map((d) =>
        selectedDocumentIds.has(d.id) ? { ...d, folder_id: targetFolderId } : d
      )
    );
    setIsMoveDialogOpen(false);
    exitSelectionMode();

    const folderName =
      targetFolderId == null
        ? t('documents.folder_no_folder')
        : (folders.find((f) => f.id === targetFolderId)?.name ?? '');

    showActionToast({
      message: t('documents.documents_moved_to', {
        count: moved.length,
        folderName,
      }),
      primaryAction: {
        label: t('toast.go'),
        // Navigate to the destination folder directly in client state
        onClick: () =>
          setSelectedFolderId(
            targetFolderId === null ? 'root' : targetFolderId
          ),
      },
      undoAction: {
        label: t('toast.undo'),
        onUndo: () => {
          // Revert optimistic update
          setDocuments((prev) =>
            prev.map((d) => {
              const m = moved.find((x) => x.docId === d.id);
              if (!m) return d;
              return { ...d, folder_id: m.previousFolderId };
            })
          );
          // Confirmation toast — dismiss() was already called in ActionToastProvider
          // before onUndo(), so this new toast will not be immediately cleared.
          showActionToast({ message: t('documents.move_undone') });
          // Server reverts in background.
          // We intentionally do NOT call cache.invalidate here: the session cache
          // already holds the pre-move documents (never updated after the move),
          // so it is already correct after the undo.
          void (async () => {
            for (const { docId, previousFolderId: prev } of moved) {
              await updateDocument(docId, { folder_id: prev });
            }
          })();
        },
      },
    });

    // Background server writes; on failure revert and dismiss toast
    void (async () => {
      for (const { docId } of moved) {
        const { error } = await updateDocument(docId, {
          folder_id: targetFolderId,
        });
        if (error) {
          setDocuments((prev) =>
            prev.map((d) => {
              const m = moved.find((x) => x.docId === d.id);
              if (!m) return d;
              return { ...d, folder_id: m.previousFolderId };
            })
          );
          toastError(t('documents.move_error'));
          dismiss();
          return;
        }
      }
    })();
  };

  const handleDeleteDocs = async () => {
    if (selectedDocumentIds.size === 0) return;
    const ids = Array.from(selectedDocumentIds);
    setIsDeletingDocs(true);
    const result = await deleteDocuments(projectId, ids);
    setIsDeletingDocs(false);

    if (result.error) {
      toastError(t('documents.delete_docs_error'));
      return;
    }

    const deletedSet = new Set(ids);
    setDocuments((prev) => prev.filter((d) => !deletedSet.has(d.id)));
    setIsDeleteDocsOpen(false);
    exitSelectionMode();
    cache.invalidate({ type: 'documents', projectId });
  };

  // ─── JSX ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 min-h-full">
      {/* Recently opened widget — grid view only; persisted dismiss via sessionStorage */}
      {selectedFolderId === null && recentDocsFiltered.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              {t('documents.recently_opened_section')}
            </h2>
            <button
              type="button"
              onClick={handleDismissRecentDocs}
              aria-label={t('documents.dismiss_recently_opened')}
              className="rounded p-1 hover:bg-muted text-muted-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="rounded-lg border border-border overflow-hidden bg-card">
            {recentDocsFiltered.map((file) => (
              <button
                key={file.id}
                type="button"
                onClick={() => openDoc(file)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-left border-b border-border last:border-b-0',
                  'hover:bg-muted/30 transition-colors',
                  'border-l-4 border-l-primary bg-primary/5'
                )}
              >
                <FileText className="w-5 h-5 flex-shrink-0 text-muted-foreground" />
                <span className="flex-1 min-w-0 truncate text-sm font-medium">
                  {file.title}
                </span>
                <Clock
                  className="w-4 h-4 flex-shrink-0 text-primary"
                  aria-label={t('documents.recently_opened_section')}
                />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Folder grid (initial view) */}
      {selectedFolderId === null && (
        <section className="mb-6">
          {!folderSelectionMode ? (
            /* Normal header: label + "Select" (if folders exist) + "New folder" */
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-muted-foreground">
                {t('documents.folders_section')}
              </h2>
              <div className="flex items-center gap-2">
                {folders.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setFolderSelectionMode(true)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
                  >
                    <CheckSquare className="w-4 h-4" />
                    {t('documents.folder_select_mode')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsCreateFolderOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
                >
                  <FolderPlus className="w-4 h-4" />
                  {t('documents.new_folder')}
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
                {t('documents.folder_selection_cancel')}
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
                    ? t('documents.folder_deselect_all')
                    : t('documents.folder_select_all')}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={selectedFolderIds.size === 0}
                  onClick={() => setIsDeleteFoldersOpen(true)}
                  className="gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  {t('documents.folder_delete_selected', {
                    count: selectedFolderIds.size,
                  })}
                </Button>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* "No folder" virtual card — never selectable for deletion */}
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
                  {t('documents.folder_no_folder')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('documents.documents_count', {
                    count: docCountByFolder.root,
                  })}
                </p>
              </div>
            </button>

            {/* Named folder cards */}
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
                    'flex items-center gap-4 rounded-lg border border-border bg-muted/30 p-4 text-left hover:bg-muted/50 hover:border-primary/30 transition-colors',
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
                      {t('documents.documents_count', {
                        count: docCountByFolder.byId[folder.id] ?? 0,
                      })}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Inside folder: back, title, filters/selection toolbar, document list */}
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
              }}
              className="gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" />
              {t('documents.back_to_folders')}
            </Button>
          </div>

          <h2 className="text-lg font-semibold mb-3">
            {selectedFolderId === 'root'
              ? t('documents.folder_no_folder')
              : (folders.find((f) => f.id === selectedFolderId)?.name ?? '')}
          </h2>

          {/* Filter toolbar OR selection toolbar */}
          {!selectionMode ? (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <div className="relative flex-1 min-w-[180px] max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder={t('documents.search_placeholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select
                value={filterCategory || 'all'}
                onValueChange={(v) => setFilterCategory(v === 'all' ? '' : v)}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue
                    placeholder={t('documents.filter_by_category')}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t('documents.folder_all')}
                  </SelectItem>
                  {DOCUMENT_CATEGORY_VALUES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {t(
                        `documents.category_${cat}` as Parameters<typeof t>[0]
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {allTagsFromDocuments.length > 0 && (
                <Select
                  value=""
                  onValueChange={(v) => {
                    if (v && !filterTags.includes(v))
                      setFilterTags((prev) => [...prev, v]);
                  }}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder={t('documents.filter_by_tags')} />
                  </SelectTrigger>
                  <SelectContent>
                    {allTagsFromDocuments
                      .filter((tag) => !filterTags.includes(tag))
                      .map((tag) => (
                        <SelectItem key={tag} value={tag}>
                          {tag}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
              {filterTags.length > 0 && (
                <span className="flex flex-wrap gap-1">
                  {filterTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() =>
                          setFilterTags((prev) => prev.filter((t) => t !== tag))
                        }
                        aria-label={t('common.remove')}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </span>
              )}
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  {t('documents.clear_filters')}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectionMode(true)}
                className="gap-1.5 ml-auto"
              >
                <Square className="w-4 h-4" />
                {t('documents.select')}
              </Button>
            </div>
          ) : (
            /* Selection toolbar */
            <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
              <Button
                variant="ghost"
                size="sm"
                onClick={exitSelectionMode}
                className="gap-1.5"
              >
                {t('documents.cancel_selection')}
              </Button>
              <div className="flex items-center gap-2 ml-auto">
                {displayList.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const allSelected = displayList.every((d) =>
                        selectedDocumentIds.has(d.id)
                      );
                      if (allSelected) {
                        setSelectedDocumentIds(new Set());
                      } else {
                        setSelectedDocumentIds(
                          new Set(displayList.map((d) => d.id))
                        );
                      }
                    }}
                    className="gap-1.5"
                  >
                    {displayList.every((d) => selectedDocumentIds.has(d.id))
                      ? t('documents.deselect_all')
                      : t('documents.select_all')}
                  </Button>
                )}
                {selectedDocumentIds.size > 0 && (
                  <>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => setIsMoveDialogOpen(true)}
                      className="gap-1.5"
                    >
                      <Move className="w-4 h-4" />
                      {t('documents.move_to_folder')} (
                      {selectedDocumentIds.size})
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setIsDeleteDocsOpen(true)}
                      disabled={isDeletingDocs}
                      className="gap-1.5"
                    >
                      <Trash2 className="w-4 h-4" />
                      {t('documents.delete_selected')} (
                      {selectedDocumentIds.size})
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {filteredDocuments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 bg-card rounded-lg border border-border">
              <FolderOpen className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-center mb-1">
                {t('documents.no_documents_yet')}
              </p>
              <p className="text-sm text-muted-foreground text-center mb-5">
                {t('documents.no_documents_hint')}
              </p>
              <button
                type="button"
                onClick={() => setIsUploadOpen(true)}
                className="text-sm font-medium text-primary hover:underline"
              >
                {t('documents.upload')}
              </button>
            </div>
          ) : (
            <div className="bg-card rounded-lg border border-border overflow-hidden">
              {displayList.map((file) => {
                const isSelected = selectedDocumentIds.has(file.id);
                return (
                  <div
                    key={file.id}
                    className={cn(
                      'flex items-center',
                      selectionMode && isSelected && 'bg-primary/5'
                    )}
                  >
                    {selectionMode && (
                      <div className="pl-3 shrink-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleDocumentSelection(file.id)}
                          aria-label={t('documents.select')}
                          className="h-4 w-4 rounded border-border cursor-pointer"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <DocumentRow
                        file={file}
                        isRecentlyOpened={false}
                        onDocumentOpened={handleDocumentOpened}
                        onEdit={(f) => setEditTarget(f)}
                        onArchive={handleArchive}
                        onDelete={handleDelete}
                        onFinalToggle={handleFinalToggle}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* FAB — Upload; hidden when document multi-select is active */}
      {!selectionMode && (
        <button
          type="button"
          onClick={() => setIsUploadOpen(true)}
          aria-label={t('documents.upload')}
          className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background md:bottom-8 md:right-8"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      <UploadDocumentDialog
        open={isUploadOpen}
        projectId={projectId}
        folders={folders}
        defaultFolderId={
          selectedFolderId === null
            ? undefined
            : selectedFolderId === 'root'
              ? null
              : selectedFolderId
        }
        defaultCategory="other"
        onClose={() => setIsUploadOpen(false)}
        onSuccess={handleUploadSuccess}
      />

      <CreateFolderDialog
        open={isCreateFolderOpen}
        projectId={projectId}
        onClose={() => setIsCreateFolderOpen(false)}
        onSuccess={handleCreateFolderSuccess}
      />

      <EditDocumentDialog
        open={editTarget !== null}
        file={editTarget}
        folders={folders}
        onClose={() => setEditTarget(null)}
        onSuccess={handleEditSuccess}
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

      <MoveDocumentsToFolderDialog
        open={isMoveDialogOpen}
        folders={folders}
        selectedCount={selectedDocumentIds.size}
        projectId={projectId}
        currentFolderId={selectedFolderId}
        onClose={() => setIsMoveDialogOpen(false)}
        onMove={handleMoveToFolder}
        onFolderCreated={(folder) => setFolders((prev) => [...prev, folder])}
      />

      <DeleteDocumentsConfirmDialog
        open={isDeleteDocsOpen}
        documentCount={selectedDocumentIds.size}
        isAllDocsInFolder={
          displayList.length > 0 &&
          displayList.every((d) => selectedDocumentIds.has(d.id))
        }
        isDeleting={isDeletingDocs}
        onConfirm={() => void handleDeleteDocs()}
        onCancel={() => setIsDeleteDocsOpen(false)}
      />
    </div>
  );
}
