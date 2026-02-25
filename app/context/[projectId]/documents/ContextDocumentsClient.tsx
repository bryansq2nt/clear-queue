'use client';

import { useEffect, useMemo, useState } from 'react';
import { Database } from '@/lib/supabase/types';
import { useI18n } from '@/components/shared/I18nProvider';
import {
  getDocuments,
  archiveDocument,
  deleteDocument,
  touchDocument,
} from '@/app/actions/documents';
import { DocumentRow } from '@/components/context/documents/DocumentRow';
import { UploadDocumentDialog } from '@/components/context/documents/UploadDocumentDialog';
import { EditDocumentDialog } from '@/components/context/documents/EditDocumentDialog';
import { CreateFolderDialog } from '@/components/context/documents/CreateFolderDialog';
import {
  ChevronLeft,
  Clock,
  FileText,
  FolderOpen,
  FolderPlus,
  Plus,
  Search,
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
  const [documents, setDocuments] = useState<ProjectFile[]>(initialDocuments);
  const [folders, setFolders] = useState<DocumentFolder[]>(initialFolders);
  const [selectedFolderId, setSelectedFolderId] =
    useState<SelectedFolder>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProjectFile | null>(null);

  useEffect(() => {
    setDocuments(initialDocuments);
  }, [initialDocuments]);

  useEffect(() => {
    setFolders(initialFolders);
  }, [initialFolders]);

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

  const clearFilters = () => {
    setSearchQuery('');
    setFilterCategory('');
    setFilterTags([]);
  };

  /** Group filtered docs by folder_id for dashboard blocks */
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

  const refresh = async () => {
    if (onRefresh) {
      await onRefresh();
      return;
    }
    const data = await getDocuments(projectId);
    setDocuments(data);
  };

  const handleUploadSuccess = (fileOrFiles: ProjectFile | ProjectFile[]) => {
    setIsUploadOpen(false);
    const next = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
    setDocuments((prev) => [...next, ...prev]);
    void onRefresh?.();
  };

  const handleCreateFolderSuccess = (folder: DocumentFolder) => {
    setFolders((prev) =>
      [...prev, folder].sort((a, b) => a.sort_order - b.sort_order)
    );
    setSelectedFolderId(folder.id);
    void onRefresh?.();
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

  const recentDocumentIds = useMemo(
    () =>
      new Set(
        sortDocumentsForDisplay(filteredDocuments)
          .slice(0, MAX_RECENT_DOCUMENTS)
          .map((d) => d.id)
      ),
    [filteredDocuments]
  );

  const displayList = useMemo(
    () => sortDocumentsForDisplay(filteredDocuments),
    [filteredDocuments]
  );

  const recentFive = useMemo(
    () => displayList.slice(0, MAX_RECENT_DOCUMENTS),
    [displayList]
  );

  const openDoc = (file: ProjectFile) => {
    window.open(
      `/api/documents/${file.id}/view`,
      '_blank',
      'noopener,noreferrer'
    );
    handleDocumentOpened(file);
  };

  return (
    <div className="p-4 md:p-6 min-h-full">
      {/* Recently opened widget — only on folder cards view, not inside a folder */}
      {selectedFolderId === null && recentFive.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-medium text-muted-foreground mb-2">
            {t('documents.recently_opened_section')}
          </h2>
          <div className="rounded-lg border border-border overflow-hidden bg-card">
            {recentFive.map((file) => (
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
                  aria-label={t('context.recently_opened')}
                />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Step 1: Folder cards (initial view) */}
      {selectedFolderId === null && (
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              {t('documents.folders_section')}
            </h2>
            <button
              type="button"
              onClick={() => setIsCreateFolderOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
            >
              <FolderPlus className="w-4 h-4" />
              {t('documents.new_folder')}
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Card: Sin carpeta */}
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
                  {t('documents.folder_no_folder')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('documents.documents_count', {
                    count: docCountByFolder.root,
                  })}
                </p>
              </div>
            </button>
            {/* Cards: one per folder */}
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
                    {t('documents.documents_count', {
                      count: docCountByFolder.byId[folder.id] ?? 0,
                    })}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Step 2: Document list inside selected folder */}
      {selectedFolderId !== null && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedFolderId(null);
                clearFilters();
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
          {/* Search + category filter (only when inside a folder) */}
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
                <SelectValue placeholder={t('documents.filter_by_category')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('documents.folder_all')}</SelectItem>
                {DOCUMENT_CATEGORY_VALUES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {t(`documents.category_${cat}` as Parameters<typeof t>[0])}
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
          </div>

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
              {sortDocumentsForDisplay(filteredDocuments).map((file) => (
                <DocumentRow
                  key={file.id}
                  file={file}
                  isRecentlyOpened={false}
                  onDocumentOpened={handleDocumentOpened}
                  onEdit={(f) => setEditTarget(f)}
                  onArchive={handleArchive}
                  onDelete={handleDelete}
                  onFinalToggle={handleFinalToggle}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* FAB — always visible so users can upload more */}
      <button
        type="button"
        onClick={() => setIsUploadOpen(true)}
        aria-label={t('documents.upload')}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background md:bottom-8 md:right-8"
      >
        <Plus className="h-6 w-6" />
      </button>

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
    </div>
  );
}
