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
import { FolderOpen, Plus } from 'lucide-react';

type ProjectFile = Database['public']['Tables']['project_files']['Row'];

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

interface ContextDocumentsClientProps {
  projectId: string;
  initialDocuments: ProjectFile[];
  onRefresh?: () => void | Promise<void>;
}

export default function ContextDocumentsClient({
  projectId,
  initialDocuments,
  onRefresh,
}: ContextDocumentsClientProps) {
  const { t } = useI18n();
  const [documents, setDocuments] = useState<ProjectFile[]>(initialDocuments);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProjectFile | null>(null);

  useEffect(() => {
    setDocuments(initialDocuments);
  }, [initialDocuments]);

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
    // Keep session cache in sync so returning to this tab shows the new list
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
    () => new Set(documents.slice(0, MAX_RECENT_DOCUMENTS).map((d) => d.id)),
    [documents]
  );

  return (
    <div className="p-4 md:p-6 min-h-full">
      {documents.length === 0 ? (
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
          {documents.map((file) => (
            <DocumentRow
              key={file.id}
              file={file}
              isRecentlyOpened={recentDocumentIds.has(file.id)}
              onDocumentOpened={handleDocumentOpened}
              onEdit={(f) => setEditTarget(f)}
              onArchive={handleArchive}
              onDelete={handleDelete}
              onFinalToggle={handleFinalToggle}
            />
          ))}
        </div>
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
        onClose={() => setIsUploadOpen(false)}
        onSuccess={handleUploadSuccess}
      />

      <EditDocumentDialog
        open={editTarget !== null}
        file={editTarget}
        onClose={() => setEditTarget(null)}
        onSuccess={handleEditSuccess}
      />
    </div>
  );
}
