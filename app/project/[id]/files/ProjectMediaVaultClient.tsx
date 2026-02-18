'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import {
  Archive,
  ChevronDown,
  Copy,
  Download,
  Eye,
  FileIcon,
  FileText,
  ImagePlus,
  Link2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  archiveProjectDocumentAction,
  archiveProjectMediaAction,
  deleteProjectDocumentAction,
  deleteProjectMediaAction,
  getProjectMediaSignedUrlAction,
  getSignedDocUrlAction,
  listProjectDocumentsAction,
  listProjectMediaAction,
  type DocumentListItem,
  type MediaListItem,
  updateDocumentMetadataAction,
  updateProjectMediaMetadataAction,
  uploadProjectDocumentAction,
  uploadProjectMediaAction,
} from './actions';
import {
  DOCUMENT_HUB_ALLOWED_MIME_TYPES,
  DOCUMENT_HUB_CATEGORIES,
  DOCUMENT_HUB_MAX_SIZE_BYTES,
  FILES_VAULT_MAX_TAGS,
  MEDIA_VAULT_ALLOWED_MIME_TYPES,
  MEDIA_VAULT_CATEGORIES,
  MEDIA_VAULT_MAX_SIZE_BYTES,
  TEMP_LINK_TTL_SECONDS,
} from './config';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

type MediaCategory = (typeof MEDIA_VAULT_CATEGORIES)[number];
type DocumentCategory = (typeof DOCUMENT_HUB_CATEGORIES)[number];
type TabKey = 'all' | 'media' | 'documents' | 'links';

interface Props {
  projectId: string;
  initialMedia: MediaListItem[];
  initialDocuments: DocumentListItem[];
}

export function ProjectMediaVaultClient({
  projectId,
  initialMedia,
  initialDocuments,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [mediaOpen, setMediaOpen] = useState(true);
  const [docsOpen, setDocsOpen] = useState(true);
  const [linksOpen, setLinksOpen] = useState(false);

  const [mediaItems, setMediaItems] = useState(initialMedia);
  const [docItems, setDocItems] = useState(initialDocuments);

  const [mediaSearch, setMediaSearch] = useState('');
  const [mediaCategoryFilter, setMediaCategoryFilter] = useState<
    'all' | MediaCategory
  >('all');
  const [mediaTagFilter, setMediaTagFilter] = useState('');

  const [docSearch, setDocSearch] = useState('');
  const [docCategoryFilter, setDocCategoryFilter] = useState<
    'all' | DocumentCategory
  >('all');
  const [docTagFilter, setDocTagFilter] = useState('');

  const [uploadMediaOpen, setUploadMediaOpen] = useState(false);
  const [uploadDocOpen, setUploadDocOpen] = useState(false);
  const [editMediaOpen, setEditMediaOpen] = useState(false);
  const [editDocOpen, setEditDocOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const [selectedMedia, setSelectedMedia] = useState<MediaListItem | null>(
    null
  );
  const [selectedDoc, setSelectedDoc] = useState<DocumentListItem | null>(null);

  const [uploadMediaFile, setUploadMediaFile] = useState<File | null>(null);
  const [uploadMediaTitle, setUploadMediaTitle] = useState('');
  const [uploadMediaCategory, setUploadMediaCategory] =
    useState<MediaCategory>('branding');
  const [uploadMediaTags, setUploadMediaTags] = useState('');

  const [uploadDocFile, setUploadDocFile] = useState<File | null>(null);
  const [uploadDocTitle, setUploadDocTitle] = useState('');
  const [uploadDocCategory, setUploadDocCategory] =
    useState<DocumentCategory>('brief');
  const [uploadDocTags, setUploadDocTags] = useState('');
  const [uploadDocDescription, setUploadDocDescription] = useState('');

  const [editMediaTitle, setEditMediaTitle] = useState('');
  const [editMediaCategory, setEditMediaCategory] =
    useState<MediaCategory>('branding');
  const [editMediaTags, setEditMediaTags] = useState('');

  const [editDocTitle, setEditDocTitle] = useState('');
  const [editDocCategory, setEditDocCategory] =
    useState<DocumentCategory>('brief');
  const [editDocTags, setEditDocTags] = useState('');
  const [editDocDescription, setEditDocDescription] = useState('');

  const [isMobile, setIsMobile] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const mediaTags = useMemo(
    () => Array.from(new Set(mediaItems.flatMap((item) => item.tags))).sort(),
    [mediaItems]
  );

  const docTags = useMemo(
    () => Array.from(new Set(docItems.flatMap((item) => item.tags))).sort(),
    [docItems]
  );

  useEffect(() => {
    refreshMedia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaSearch, mediaCategoryFilter, mediaTagFilter]);

  useEffect(() => {
    refreshDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docSearch, docCategoryFilter, docTagFilter]);

  const mediaUploadReason = useMemo(() => {
    if (!uploadMediaFile) return 'Choose an image file first.';
    if (
      !(MEDIA_VAULT_ALLOWED_MIME_TYPES as readonly string[]).includes(
        uploadMediaFile.type
      )
    ) {
      return 'Only JPEG, PNG, and WEBP are supported.';
    }
    if (uploadMediaFile.size > MEDIA_VAULT_MAX_SIZE_BYTES) {
      return `File exceeds ${Math.floor(MEDIA_VAULT_MAX_SIZE_BYTES / 1024 / 1024)}MB limit.`;
    }
    return null;
  }, [uploadMediaFile]);

  const docUploadReason = useMemo(() => {
    if (!uploadDocFile) return 'Choose a document file first.';
    if (
      !(DOCUMENT_HUB_ALLOWED_MIME_TYPES as readonly string[]).includes(
        uploadDocFile.type
      )
    ) {
      return 'Unsupported document type for Phase 1.';
    }
    if (uploadDocFile.size > DOCUMENT_HUB_MAX_SIZE_BYTES) {
      return `File exceeds ${Math.floor(DOCUMENT_HUB_MAX_SIZE_BYTES / 1024 / 1024)}MB limit.`;
    }
    return null;
  }, [uploadDocFile]);

  function refreshMedia() {
    startTransition(async () => {
      const res = await listProjectMediaAction({
        projectId,
        search: mediaSearch,
        category: mediaCategoryFilter,
        tag: mediaTagFilter,
      });
      if (res.ok) setMediaItems(res.data);
      else window.alert(res.error);
    });
  }

  function refreshDocs() {
    startTransition(async () => {
      const res = await listProjectDocumentsAction({
        projectId,
        search: docSearch,
        category: docCategoryFilter,
        tag: docTagFilter,
      });
      if (res.ok) setDocItems(res.data);
      else window.alert(res.error);
    });
  }

  function openMediaPreview(item: MediaListItem) {
    setSelectedDoc(null);
    setSelectedMedia(item);
    setPreviewOpen(true);
  }

  function openDocPreview(item: DocumentListItem) {
    setSelectedMedia(null);
    setSelectedDoc(item);
    setPreviewOpen(true);
  }

  function openMediaEdit(item: MediaListItem) {
    setSelectedMedia(item);
    setEditMediaTitle(item.title);
    setEditMediaCategory(item.media_category);
    setEditMediaTags(item.tags.join(', '));
    setEditMediaOpen(true);
  }

  function openDocEdit(item: DocumentListItem) {
    setSelectedDoc(item);
    setEditDocTitle(item.title);
    setEditDocCategory(item.document_category);
    setEditDocTags(item.tags.join(', '));
    setEditDocDescription(item.description || '');
    setEditDocOpen(true);
  }

  function resetMediaUploadForm() {
    setUploadMediaFile(null);
    setUploadMediaTitle('');
    setUploadMediaTags('');
    setUploadMediaCategory('branding');
  }

  function resetDocUploadForm() {
    setUploadDocFile(null);
    setUploadDocTitle('');
    setUploadDocTags('');
    setUploadDocDescription('');
    setUploadDocCategory('brief');
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4 pb-24 md:pb-6">
      <div className="rounded-lg border border-border bg-card p-4 sm:p-5 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Project Files</h2>
            <p className="text-sm text-muted-foreground">
              Media Vault + Document Hub in project context.
            </p>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-11 min-w-[120px]">
                <Plus className="mr-2 h-4 w-4" />
                Add
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setUploadMediaOpen(true)}>
                <ImagePlus className="mr-2 h-4 w-4" /> Upload Media
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setUploadDocOpen(true)}>
                <FileText className="mr-2 h-4 w-4" /> Upload Document
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                <Link2 className="mr-2 h-4 w-4" /> Add Link (coming soon)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="media">Media</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="links">Links</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-3 mt-3">
          <SectionCard
            title="Media"
            description="Images uploaded to private project-media bucket"
            open={mediaOpen}
            onToggle={() => setMediaOpen((v) => !v)}
          >
            {mediaOpen && (
              <div className="p-4 pt-0 space-y-3">
                <MediaFilters
                  search={mediaSearch}
                  setSearch={setMediaSearch}
                  category={mediaCategoryFilter}
                  setCategory={setMediaCategoryFilter}
                  tag={mediaTagFilter}
                  setTag={setMediaTagFilter}
                  tags={mediaTags}
                />
                <MediaGrid
                  items={mediaItems}
                  onPreview={openMediaPreview}
                  onDownload={handleMediaDownload}
                  onCopy={handleMediaCopy}
                  onEdit={openMediaEdit}
                  onArchive={handleMediaArchive}
                  onDelete={handleMediaDelete}
                  pending={pending}
                />
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Documents"
            description="Files uploaded to private project-docs bucket"
            open={docsOpen}
            onToggle={() => setDocsOpen((v) => !v)}
          >
            {docsOpen && (
              <div className="p-4 pt-0 space-y-3">
                <DocumentFilters
                  search={docSearch}
                  setSearch={setDocSearch}
                  category={docCategoryFilter}
                  setCategory={setDocCategoryFilter}
                  tag={docTagFilter}
                  setTag={setDocTagFilter}
                  tags={docTags}
                />
                <DocumentsList
                  items={docItems}
                  onPreview={openDocPreview}
                  onDownload={handleDocDownload}
                  onCopy={handleDocCopy}
                  onEdit={openDocEdit}
                  onArchive={handleDocArchive}
                  onDelete={handleDocDelete}
                  pending={pending}
                />
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Links"
            description="Coming soon in PR4"
            open={linksOpen}
            onToggle={() => setLinksOpen((v) => !v)}
          >
            {linksOpen && (
              <PlaceholderPanel message="Link Vault will be enabled in the next PR." />
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="media" className="space-y-3 mt-3">
          <MediaFilters
            search={mediaSearch}
            setSearch={setMediaSearch}
            category={mediaCategoryFilter}
            setCategory={setMediaCategoryFilter}
            tag={mediaTagFilter}
            setTag={setMediaTagFilter}
            tags={mediaTags}
          />
          <MediaGrid
            items={mediaItems}
            onPreview={openMediaPreview}
            onDownload={handleMediaDownload}
            onCopy={handleMediaCopy}
            onEdit={openMediaEdit}
            onArchive={handleMediaArchive}
            onDelete={handleMediaDelete}
            pending={pending}
          />
        </TabsContent>

        <TabsContent value="documents" className="space-y-3 mt-3">
          <DocumentFilters
            search={docSearch}
            setSearch={setDocSearch}
            category={docCategoryFilter}
            setCategory={setDocCategoryFilter}
            tag={docTagFilter}
            setTag={setDocTagFilter}
            tags={docTags}
          />
          <DocumentsList
            items={docItems}
            onPreview={openDocPreview}
            onDownload={handleDocDownload}
            onCopy={handleDocCopy}
            onEdit={openDocEdit}
            onArchive={handleDocArchive}
            onDelete={handleDocDelete}
            pending={pending}
          />
        </TabsContent>

        <TabsContent value="links" className="mt-3">
          <PlaceholderPanel message="Links remain placeholder in PR3." />
        </TabsContent>
      </Tabs>

      <Dialog open={uploadMediaOpen} onOpenChange={setUploadMediaOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload media</DialogTitle>
            <DialogDescription>
              Allowed: JPEG/PNG/WEBP. Max{' '}
              {Math.floor(MEDIA_VAULT_MAX_SIZE_BYTES / 1024 / 1024)}MB.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              type="file"
              accept={MEDIA_VAULT_ALLOWED_MIME_TYPES.join(',')}
              onChange={(e) => setUploadMediaFile(e.target.files?.[0] || null)}
            />
            <Input
              placeholder="Title (optional)"
              value={uploadMediaTitle}
              onChange={(e) => setUploadMediaTitle(e.target.value)}
            />
            <Select
              value={uploadMediaCategory}
              onValueChange={(v) => setUploadMediaCategory(v as MediaCategory)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEDIA_VAULT_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>
                    {humanize(category)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder={`Tags (comma separated, max ${FILES_VAULT_MAX_TAGS})`}
              value={uploadMediaTags}
              onChange={(e) => setUploadMediaTags(e.target.value)}
            />
            {mediaUploadReason && (
              <p className="text-sm text-amber-600">{mediaUploadReason}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadMediaOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending || Boolean(mediaUploadReason)}
              onClick={() => {
                if (!uploadMediaFile) return;
                startTransition(async () => {
                  const res = await uploadProjectMediaAction({
                    projectId,
                    file: uploadMediaFile,
                    title: uploadMediaTitle,
                    category: uploadMediaCategory,
                    tags: uploadMediaTags,
                  });
                  if (!res.ok) return window.alert(res.error);
                  setUploadMediaOpen(false);
                  resetMediaUploadForm();
                  refreshMedia();
                });
              }}
            >
              Upload Media
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={uploadDocOpen} onOpenChange={setUploadDocOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload document</DialogTitle>
            <DialogDescription>
              Supported: PDF, TXT, CSV, DOCX, XLSX. Max{' '}
              {Math.floor(DOCUMENT_HUB_MAX_SIZE_BYTES / 1024 / 1024)}MB.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              type="file"
              accept={DOCUMENT_HUB_ALLOWED_MIME_TYPES.join(',')}
              onChange={(e) => setUploadDocFile(e.target.files?.[0] || null)}
            />
            <Input
              placeholder="Title (optional)"
              value={uploadDocTitle}
              onChange={(e) => setUploadDocTitle(e.target.value)}
            />
            <Select
              value={uploadDocCategory}
              onValueChange={(v) => setUploadDocCategory(v as DocumentCategory)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_HUB_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>
                    {humanize(category)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder={`Tags (comma separated, max ${FILES_VAULT_MAX_TAGS})`}
              value={uploadDocTags}
              onChange={(e) => setUploadDocTags(e.target.value)}
            />
            <Input
              placeholder="Description (optional)"
              value={uploadDocDescription}
              onChange={(e) => setUploadDocDescription(e.target.value)}
            />
            {docUploadReason && (
              <p className="text-sm text-amber-600">{docUploadReason}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDocOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending || Boolean(docUploadReason)}
              onClick={() => {
                if (!uploadDocFile) return;
                startTransition(async () => {
                  const res = await uploadProjectDocumentAction({
                    projectId,
                    file: uploadDocFile,
                    title: uploadDocTitle,
                    category: uploadDocCategory,
                    tags: uploadDocTags,
                    description: uploadDocDescription,
                  });
                  if (!res.ok) return window.alert(res.error);
                  setUploadDocOpen(false);
                  resetDocUploadForm();
                  refreshDocs();
                });
              }}
            >
              Upload Document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editMediaOpen} onOpenChange={setEditMediaOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit media metadata</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={editMediaTitle}
              onChange={(e) => setEditMediaTitle(e.target.value)}
              placeholder="Title"
            />
            <Select
              value={editMediaCategory}
              onValueChange={(v) => setEditMediaCategory(v as MediaCategory)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEDIA_VAULT_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>
                    {humanize(category)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={editMediaTags}
              onChange={(e) => setEditMediaTags(e.target.value)}
              placeholder="Tags"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMediaOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending || !selectedMedia}
              onClick={() => {
                if (!selectedMedia) return;
                startTransition(async () => {
                  const res = await updateProjectMediaMetadataAction({
                    fileId: selectedMedia.id,
                    title: editMediaTitle,
                    category: editMediaCategory,
                    tags: editMediaTags,
                  });
                  if (!res.ok) return window.alert(res.error);
                  setEditMediaOpen(false);
                  refreshMedia();
                });
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDocOpen} onOpenChange={setEditDocOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit document metadata</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={editDocTitle}
              onChange={(e) => setEditDocTitle(e.target.value)}
              placeholder="Title"
            />
            <Select
              value={editDocCategory}
              onValueChange={(v) => setEditDocCategory(v as DocumentCategory)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_HUB_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>
                    {humanize(category)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={editDocTags}
              onChange={(e) => setEditDocTags(e.target.value)}
              placeholder="Tags"
            />
            <Input
              value={editDocDescription}
              onChange={(e) => setEditDocDescription(e.target.value)}
              placeholder="Description"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDocOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending || !selectedDoc}
              onClick={() => {
                if (!selectedDoc) return;
                startTransition(async () => {
                  const res = await updateDocumentMetadataAction({
                    fileId: selectedDoc.id,
                    title: editDocTitle,
                    category: editDocCategory,
                    tags: editDocTags,
                    description: editDocDescription,
                  });
                  if (!res.ok) return window.alert(res.error);
                  setEditDocOpen(false);
                  refreshDocs();
                });
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        isMobile={isMobile}
        media={selectedMedia}
        document={selectedDoc}
        onMediaDownload={handleMediaDownload}
        onMediaCopy={handleMediaCopy}
        onMediaArchive={handleMediaArchive}
        onMediaEdit={openMediaEdit}
        onMediaDelete={handleMediaDelete}
        onDocDownload={handleDocDownload}
        onDocCopy={handleDocCopy}
        onDocArchive={handleDocArchive}
        onDocEdit={openDocEdit}
        onDocDelete={handleDocDelete}
      />

      <div className="fixed md:hidden bottom-4 left-4 right-4 z-20">
        <Button
          className="h-12 w-full text-base"
          onClick={() => {
            if (activeTab === 'documents') {
              setActiveTab('documents');
              setUploadDocOpen(true);
            } else {
              setActiveTab('media');
              setUploadMediaOpen(true);
            }
          }}
          aria-label="Add"
        >
          <Plus className="mr-2 h-5 w-5" /> Add
        </Button>
      </div>
    </div>
  );

  async function handleMediaDownload(item: MediaListItem) {
    const res = await getProjectMediaSignedUrlAction({
      fileId: item.id,
      download: true,
    });
    if (!res.ok) return window.alert(res.error);
    window.open(res.data.url, '_blank', 'noopener,noreferrer');
  }

  async function handleMediaCopy(item: MediaListItem) {
    const res = await getProjectMediaSignedUrlAction({ fileId: item.id });
    if (!res.ok) return window.alert(res.error);
    try {
      await navigator.clipboard.writeText(res.data.url);
      window.alert('Temporary link copied (expires in 30m).');
    } catch {
      window.prompt('Copy temporary URL', res.data.url);
    }
  }

  function handleMediaArchive(item: MediaListItem) {
    startTransition(async () => {
      const res = await archiveProjectMediaAction({ fileId: item.id });
      if (!res.ok) return window.alert(res.error);
      refreshMedia();
    });
  }

  function handleMediaDelete(item: MediaListItem) {
    if (!window.confirm(`Delete "${item.title}" permanently?`)) return;
    startTransition(async () => {
      const res = await deleteProjectMediaAction({ fileId: item.id });
      if (!res.ok) return window.alert(res.error);
      refreshMedia();
      setPreviewOpen(false);
    });
  }

  async function handleDocDownload(item: DocumentListItem) {
    const res = await getSignedDocUrlAction({
      fileId: item.id,
      download: true,
    });
    if (!res.ok) return window.alert(res.error);
    window.open(res.data.url, '_blank', 'noopener,noreferrer');
  }

  async function handleDocCopy(item: DocumentListItem) {
    const res = await getSignedDocUrlAction({ fileId: item.id });
    if (!res.ok) return window.alert(res.error);
    try {
      await navigator.clipboard.writeText(res.data.url);
      window.alert(
        `Temporary document link copied (expires in ~${Math.floor(TEMP_LINK_TTL_SECONDS / 60)} minutes).`
      );
    } catch {
      window.prompt('Copy temporary URL', res.data.url);
    }
  }

  function handleDocArchive(item: DocumentListItem) {
    startTransition(async () => {
      const res = await archiveProjectDocumentAction({ fileId: item.id });
      if (!res.ok) return window.alert(res.error);
      refreshDocs();
    });
  }

  function handleDocDelete(item: DocumentListItem) {
    if (!window.confirm(`Delete "${item.title}" permanently?`)) return;
    startTransition(async () => {
      const res = await deleteProjectDocumentAction({ fileId: item.id });
      if (!res.ok) return window.alert(res.error);
      refreshDocs();
      setPreviewOpen(false);
    });
  }
}

function MediaFilters({
  search,
  setSearch,
  category,
  setCategory,
  tag,
  setTag,
  tags,
}: {
  search: string;
  setSearch: (v: string) => void;
  category: 'all' | MediaCategory;
  setCategory: (v: 'all' | MediaCategory) => void;
  tag: string;
  setTag: (v: string) => void;
  tags: string[];
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search media"
      />
      <Select
        value={category}
        onValueChange={(v) => setCategory(v as 'all' | MediaCategory)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {MEDIA_VAULT_CATEGORIES.map((c) => (
            <SelectItem key={c} value={c}>
              {humanize(c)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <TagFilter value={tag} onChange={setTag} tags={tags} />
    </div>
  );
}

function DocumentFilters({
  search,
  setSearch,
  category,
  setCategory,
  tag,
  setTag,
  tags,
}: {
  search: string;
  setSearch: (v: string) => void;
  category: 'all' | DocumentCategory;
  setCategory: (v: 'all' | DocumentCategory) => void;
  tag: string;
  setTag: (v: string) => void;
  tags: string[];
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search documents"
      />
      <Select
        value={category}
        onValueChange={(v) => setCategory(v as 'all' | DocumentCategory)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {DOCUMENT_HUB_CATEGORIES.map((c) => (
            <SelectItem key={c} value={c}>
              {humanize(c)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <TagFilter value={tag} onChange={setTag} tags={tags} />
    </div>
  );
}

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="pl-9"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function TagFilter({
  value,
  onChange,
  tags,
}: {
  value: string;
  onChange: (v: string) => void;
  tags: string[];
}) {
  return (
    <Select
      value={value || 'all'}
      onValueChange={(v) => onChange(v === 'all' ? '' : v)}
    >
      <SelectTrigger>
        <SelectValue placeholder="Tag" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All tags</SelectItem>
        {tags.map((tag) => (
          <SelectItem key={tag} value={tag}>
            #{tag}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SectionCard({
  title,
  description,
  open,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <button
        type="button"
        className="w-full min-h-11 px-4 py-3 flex items-center justify-between text-left"
        onClick={onToggle}
      >
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>
      {children}
    </section>
  );
}

function PlaceholderPanel({ message }: { message: string }) {
  return (
    <div className="border-t border-border px-4 py-8 text-sm text-muted-foreground text-center">
      {message}
    </div>
  );
}

function MediaGrid({
  items,
  onPreview,
  onDownload,
  onCopy,
  onEdit,
  onArchive,
  onDelete,
  pending,
}: {
  items: MediaListItem[];
  onPreview: (item: MediaListItem) => void;
  onDownload: (item: MediaListItem) => void;
  onCopy: (item: MediaListItem) => void;
  onEdit: (item: MediaListItem) => void;
  onArchive: (item: MediaListItem) => void;
  onDelete: (item: MediaListItem) => void;
  pending: boolean;
}) {
  if (pending && items.length === 0)
    return <LoadingBlock text="Loading media..." />;
  if (items.length === 0) return <EmptyBlock text="No media files found." />;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {items.map((item) => (
        <article
          key={item.id}
          className="rounded-lg border border-border bg-card overflow-hidden"
        >
          <button
            type="button"
            onClick={() => onPreview(item)}
            className="block w-full aspect-[4/3] bg-muted"
          >
            {item.signed_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.signed_url}
                alt={item.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                <Eye className="h-6 w-6" />
              </div>
            )}
          </button>
          <div className="p-3 space-y-2">
            <h4 className="font-medium text-sm line-clamp-2">{item.title}</h4>
            <div className="flex flex-wrap gap-1.5">
              <Badge>{humanize(item.media_category)}</Badge>
              {item.tags.slice(0, 2).map((tag) => (
                <TagPill key={tag} tag={tag} />
              ))}
            </div>
            <SmallActions
              onPreview={() => onPreview(item)}
              onDownload={() => onDownload(item)}
              onCopy={() => onCopy(item)}
              onEdit={() => onEdit(item)}
              onArchive={() => onArchive(item)}
              onDelete={() => onDelete(item)}
            />
          </div>
        </article>
      ))}
    </div>
  );
}

function DocumentsList({
  items,
  onPreview,
  onDownload,
  onCopy,
  onEdit,
  onArchive,
  onDelete,
  pending,
}: {
  items: DocumentListItem[];
  onPreview: (item: DocumentListItem) => void;
  onDownload: (item: DocumentListItem) => void;
  onCopy: (item: DocumentListItem) => void;
  onEdit: (item: DocumentListItem) => void;
  onArchive: (item: DocumentListItem) => void;
  onDelete: (item: DocumentListItem) => void;
  pending: boolean;
}) {
  if (pending && items.length === 0)
    return <LoadingBlock text="Loading documents..." />;
  if (items.length === 0) return <EmptyBlock text="No documents found." />;

  return (
    <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
      {items.map((item) => (
        <div key={item.id} className="p-3 sm:p-4 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              <FileIcon className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm sm:text-base truncate">
                {item.title}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatSize(item.size_bytes)} · {formatDate(item.created_at)}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge>{humanize(item.document_category)}</Badge>
                {item.tags.slice(0, 3).map((tag) => (
                  <TagPill key={tag} tag={tag} />
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
            <MiniAction title="Preview" onClick={() => onPreview(item)}>
              <Eye className="h-3.5 w-3.5" />
            </MiniAction>
            <MiniAction title="Download" onClick={() => onDownload(item)}>
              <Download className="h-3.5 w-3.5" />
            </MiniAction>
            <MiniAction title="Copy" onClick={() => onCopy(item)}>
              <Copy className="h-3.5 w-3.5" />
            </MiniAction>
            <MiniAction title="Edit" onClick={() => onEdit(item)}>
              <Pencil className="h-3.5 w-3.5" />
            </MiniAction>
            <MiniAction title="Archive" onClick={() => onArchive(item)}>
              <Archive className="h-3.5 w-3.5" />
            </MiniAction>
            <MiniAction title="Delete" onClick={() => onDelete(item)}>
              <Trash2 className="h-3.5 w-3.5" />
            </MiniAction>
          </div>
        </div>
      ))}
    </div>
  );
}

function PreviewDialog({
  open,
  onOpenChange,
  isMobile,
  media,
  document,
  onMediaDownload,
  onMediaCopy,
  onMediaArchive,
  onMediaEdit,
  onMediaDelete,
  onDocDownload,
  onDocCopy,
  onDocArchive,
  onDocEdit,
  onDocDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isMobile: boolean;
  media: MediaListItem | null;
  document: DocumentListItem | null;
  onMediaDownload: (item: MediaListItem) => void;
  onMediaCopy: (item: MediaListItem) => void;
  onMediaArchive: (item: MediaListItem) => void;
  onMediaEdit: (item: MediaListItem) => void;
  onMediaDelete: (item: MediaListItem) => void;
  onDocDownload: (item: DocumentListItem) => void;
  onDocCopy: (item: DocumentListItem) => void;
  onDocArchive: (item: DocumentListItem) => void;
  onDocEdit: (item: DocumentListItem) => void;
  onDocDelete: (item: DocumentListItem) => void;
}) {
  const isPdf = Boolean(document?.mime_type === 'application/pdf');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'overflow-y-auto p-0',
          isMobile
            ? 'left-0 top-auto translate-x-0 translate-y-0 bottom-0 rounded-t-xl rounded-b-none max-w-none h-[78vh]'
            : 'left-auto right-0 top-0 translate-x-0 translate-y-0 h-screen max-w-md rounded-none'
        )}
      >
        <div className="h-full flex flex-col">
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold line-clamp-2">
              {media?.title || document?.title || 'Preview'}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {media
                ? `${humanize(media.media_category)} · ${formatSize(media.size_bytes)}`
                : document
                  ? `${humanize(document.document_category)} · ${formatSize(document.size_bytes)}`
                  : ''}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {media?.signed_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={media.signed_url}
                alt={media.title}
                className="w-full rounded-lg border border-border object-cover"
              />
            )}

            {document && (
              <>
                {isPdf && document.signed_url ? (
                  <iframe
                    src={document.signed_url}
                    className="w-full h-80 rounded-lg border border-border"
                    title={document.title}
                  />
                ) : (
                  <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                    Download to view this document type.
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Temporary links expire in about{' '}
                  {Math.floor(TEMP_LINK_TTL_SECONDS / 60)} minutes.
                </p>
              </>
            )}

            {(media?.tags || document?.tags)?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {(media?.tags || document?.tags || []).map((tag) => (
                  <TagPill key={tag} tag={tag} />
                ))}
              </div>
            ) : null}

            {media && (
              <ActionPanel
                onDownload={() => onMediaDownload(media)}
                onCopy={() => onMediaCopy(media)}
                onEdit={() => onMediaEdit(media)}
                onArchive={() => onMediaArchive(media)}
                onDelete={() => onMediaDelete(media)}
              />
            )}

            {document && (
              <ActionPanel
                onDownload={() => onDocDownload(document)}
                onCopy={() => onDocCopy(document)}
                onEdit={() => onDocEdit(document)}
                onArchive={() => onDocArchive(document)}
                onDelete={() => onDocDelete(document)}
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ActionPanel({
  onDownload,
  onCopy,
  onEdit,
  onArchive,
  onDelete,
}: {
  onDownload: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <ActionButton
          onClick={onDownload}
          icon={<Download className="h-4 w-4" />}
        >
          Download
        </ActionButton>
        <ActionButton onClick={onCopy} icon={<Copy className="h-4 w-4" />}>
          Copy link
        </ActionButton>
        <ActionButton onClick={onEdit} icon={<Pencil className="h-4 w-4" />}>
          Edit
        </ActionButton>
        <ActionButton
          onClick={onArchive}
          icon={<Archive className="h-4 w-4" />}
        >
          Archive / Restore
        </ActionButton>
      </div>
      <Button
        variant="outline"
        className="w-full h-11 text-red-600 border-red-200 hover:text-red-700"
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4 mr-2" /> Delete permanently
      </Button>
    </>
  );
}

function ActionButton({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-11 rounded-md border border-border bg-card hover:bg-accent text-sm flex items-center justify-center gap-2"
    >
      {icon}
      {children}
    </button>
  );
}

function SmallActions({
  onPreview,
  onDownload,
  onCopy,
  onEdit,
  onArchive,
  onDelete,
}: {
  onPreview: () => void;
  onDownload: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      <MiniAction title="Preview" onClick={onPreview}>
        <Eye className="h-3.5 w-3.5" />
      </MiniAction>
      <MiniAction title="Download" onClick={onDownload}>
        <Download className="h-3.5 w-3.5" />
      </MiniAction>
      <MiniAction title="Copy" onClick={onCopy}>
        <Copy className="h-3.5 w-3.5" />
      </MiniAction>
      <MiniAction title="Edit" onClick={onEdit}>
        <Pencil className="h-3.5 w-3.5" />
      </MiniAction>
      <MiniAction title="Archive" onClick={onArchive}>
        <Archive className="h-3.5 w-3.5" />
      </MiniAction>
      <MiniAction title="Delete" onClick={onDelete}>
        <Trash2 className="h-3.5 w-3.5" />
      </MiniAction>
    </div>
  );
}

function MiniAction({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="h-11 rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent flex items-center justify-center"
    >
      {children}
    </button>
  );
}

function LoadingBlock({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5">
      {children}
    </span>
  );
}

function TagPill({ tag }: { tag: string }) {
  return (
    <span className="rounded-full border border-border text-xs px-2 py-0.5">
      #{tag}
    </span>
  );
}

function humanize(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString();
}
