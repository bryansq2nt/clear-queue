'use client';

import { useEffect, useState } from 'react';
import { Database } from '@/lib/supabase/types';
import { useI18n } from '@/components/shared/I18nProvider';
import {
  getDocuments,
  archiveDocument,
  deleteDocument,
} from '@/app/actions/documents';
import { DocumentRow } from '@/components/context/documents/DocumentRow';
import { UploadDocumentDialog } from '@/components/context/documents/UploadDocumentDialog';
import { EditDocumentDialog } from '@/components/context/documents/EditDocumentDialog';
import { FolderOpen, Plus } from 'lucide-react';

type ProjectFile = Database['public']['Tables']['project_files']['Row'];

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

  const handleUploadSuccess = (file: ProjectFile) => {
    setIsUploadOpen(false);
    setDocuments((prev) => [file, ...prev]);
  };

  const handleEditSuccess = (updated: ProjectFile) => {
    setEditTarget(null);
    setDocuments((prev) =>
      prev.map((d) => (d.id === updated.id ? updated : d))
    );
  };

  const handleArchive = async (file: ProjectFile) => {
    const { success } = await archiveDocument(file.id);
    if (success) {
      setDocuments((prev) => prev.filter((d) => d.id !== file.id));
    }
  };

  const handleDelete = async (file: ProjectFile) => {
    const { success } = await deleteDocument(file.id);
    if (success) {
      setDocuments((prev) => prev.filter((d) => d.id !== file.id));
    }
  };

  const handleFinalToggle = (file: ProjectFile, isFinal: boolean) => {
    setDocuments((prev) =>
      prev.map((d) => (d.id === file.id ? { ...d, is_final: isFinal } : d))
    );
  };

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
