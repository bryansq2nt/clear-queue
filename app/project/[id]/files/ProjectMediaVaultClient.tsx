'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import {
  Archive,
  Copy,
  Download,
  ImagePlus,
  Link2,
  FileText,
  ChevronDown,
  Search,
  Pencil,
  Trash2,
  Eye,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  archiveProjectMediaAction,
  deleteProjectMediaAction,
  getProjectMediaSignedUrlAction,
  listProjectMediaAction,
  type MediaListItem,
  updateProjectMediaMetadataAction,
  uploadProjectMediaAction,
} from './actions';
import {
  MEDIA_VAULT_ALLOWED_MIME_TYPES,
  MEDIA_VAULT_CATEGORIES,
  MEDIA_VAULT_MAX_SIZE_BYTES,
  MEDIA_VAULT_MAX_TAG_LENGTH,
  MEDIA_VAULT_MAX_TAGS,
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

const config = {
  allowedMimeTypes: [...MEDIA_VAULT_ALLOWED_MIME_TYPES],
  categories: MEDIA_VAULT_CATEGORIES,
  maxSizeBytes: MEDIA_VAULT_MAX_SIZE_BYTES,
  maxTags: MEDIA_VAULT_MAX_TAGS,
  maxTagLength: MEDIA_VAULT_MAX_TAG_LENGTH,
};

type MediaCategory = (typeof config.categories)[number];
type TabKey = 'all' | 'media' | 'documents' | 'links';

interface ProjectMediaVaultClientProps {
  projectId: string;
  initialMedia: MediaListItem[];
}

export function ProjectMediaVaultClient({
  projectId,
  initialMedia,
}: ProjectMediaVaultClientProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [mediaOpen, setMediaOpen] = useState(true);
  const [docsOpen, setDocsOpen] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | MediaCategory>(
    'all'
  );
  const [tagFilter, setTagFilter] = useState('');
  const [mediaItems, setMediaItems] = useState<MediaListItem[]>(initialMedia);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selected, setSelected] = useState<MediaListItem | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCategory, setUploadCategory] =
    useState<MediaCategory>('branding');
  const [uploadTags, setUploadTags] = useState('');

  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState<MediaCategory>('branding');
  const [editTags, setEditTags] = useState('');

  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const set = () => setIsMobile(mq.matches);
    set();
    mq.addEventListener('change', set);
    return () => mq.removeEventListener('change', set);
  }, []);

  function loadMedia() {
    startTransition(async () => {
      const res = await listProjectMediaAction({
        projectId,
        search,
        category: categoryFilter,
        tag: tagFilter,
      });
      if (!res.ok) {
        window.alert(res.error);
        return;
      }
      setMediaItems(res.data);
    });
  }

  useEffect(() => {
    loadMedia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, categoryFilter, tagFilter]);

  const allTags = useMemo(() => {
    return Array.from(new Set(mediaItems.flatMap((item) => item.tags))).sort();
  }, [mediaItems]);

  const uploadDisabledReason = useMemo(() => {
    if (!uploadFile) return 'Choose an image file first.';
    if (!(config.allowedMimeTypes as string[]).includes(uploadFile.type)) {
      return 'Only JPEG, PNG, and WEBP are supported.';
    }
    if (uploadFile.size > config.maxSizeBytes) {
      return `File exceeds ${Math.floor(config.maxSizeBytes / 1024 / 1024)}MB limit.`;
    }
    return null;
  }, [uploadFile]);

  function openPreview(item: MediaListItem) {
    setSelected(item);
    setPreviewOpen(true);
  }

  function openEdit(item: MediaListItem) {
    setSelected(item);
    setEditTitle(item.title);
    setEditCategory(item.media_category);
    setEditTags(item.tags.join(', '));
    setEditOpen(true);
  }

  function toTagsInput(tags: string[]) {
    return tags.join(', ');
  }

  async function handleUploadSubmit() {
    if (!uploadFile) return;

    startTransition(async () => {
      const res = await uploadProjectMediaAction({
        projectId,
        file: uploadFile,
        category: uploadCategory,
        title: uploadTitle,
        tags: uploadTags,
      });

      if (!res.ok) {
        window.alert(res.error);
        return;
      }

      setUploadOpen(false);
      setUploadFile(null);
      setUploadTitle('');
      setUploadTags('');
      setUploadCategory('branding');
      await refresh();
    });
  }

  async function refresh() {
    const res = await listProjectMediaAction({
      projectId,
      search,
      category: categoryFilter,
      tag: tagFilter,
    });
    if (res.ok) {
      setMediaItems(res.data);
    }
  }

  async function handleDownload(item: MediaListItem) {
    const res = await getProjectMediaSignedUrlAction({
      fileId: item.id,
      download: true,
    });
    if (!res.ok) {
      window.alert(res.error);
      return;
    }
    window.open(res.data.url, '_blank', 'noopener,noreferrer');
  }

  async function handleCopy(item: MediaListItem) {
    const res = await getProjectMediaSignedUrlAction({ fileId: item.id });
    if (!res.ok) {
      window.alert(res.error);
      return;
    }
    try {
      await navigator.clipboard.writeText(res.data.url);
    } catch {
      window.prompt('Copy signed URL', res.data.url);
    }
  }

  async function handleArchive(item: MediaListItem) {
    startTransition(async () => {
      const res = await archiveProjectMediaAction({ fileId: item.id });
      if (!res.ok) {
        window.alert(res.error);
        return;
      }
      await refresh();
      if (selected?.id === item.id) {
        setPreviewOpen(false);
      }
    });
  }

  async function handleDelete(item: MediaListItem) {
    if (!window.confirm(`Delete "${item.title}" permanently?`)) return;
    startTransition(async () => {
      const res = await deleteProjectMediaAction({ fileId: item.id });
      if (!res.ok) {
        window.alert(res.error);
        return;
      }
      await refresh();
      if (selected?.id === item.id) {
        setPreviewOpen(false);
      }
    });
  }

  async function handleSaveEdit() {
    if (!selected) return;

    startTransition(async () => {
      const res = await updateProjectMediaMetadataAction({
        fileId: selected.id,
        title: editTitle,
        category: editCategory,
        tags: editTags,
      });

      if (!res.ok) {
        window.alert(res.error);
        return;
      }

      setEditOpen(false);
      await refresh();
    });
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4 pb-24 md:pb-6">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Media Vault</h2>
            <p className="text-sm text-muted-foreground">
              Project-centric media storage with signed, private access.
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
              <DropdownMenuItem onClick={() => setUploadOpen(true)}>
                <ImagePlus className="mr-2 h-4 w-4" />
                Upload Media
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                <FileText className="mr-2 h-4 w-4" />
                Upload Document (coming soon)
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                <Link2 className="mr-2 h-4 w-4" />
                Add Link (coming soon)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by title"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Select
            value={categoryFilter}
            onValueChange={(value) =>
              setCategoryFilter(value as 'all' | MediaCategory)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {config.categories.map((category) => (
                <SelectItem key={category} value={category}>
                  {humanize(category)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={tagFilter || 'all'} onValueChange={setTagFilterOrAll}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by tag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tags</SelectItem>
              {allTags.map((tag) => (
                <SelectItem key={tag} value={tag}>
                  #{tag}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            description="Images uploaded to project-media bucket"
            open={mediaOpen}
            onToggle={() => setMediaOpen((v) => !v)}
          >
            {mediaOpen && (
              <MediaGrid
                items={mediaItems}
                pending={pending}
                onPreview={openPreview}
                onDownload={handleDownload}
                onCopy={handleCopy}
                onEdit={openEdit}
                onArchive={handleArchive}
                onDelete={handleDelete}
              />
            )}
          </SectionCard>

          <SectionCard
            title="Documents"
            description="Coming soon in PR3"
            open={docsOpen}
            onToggle={() => setDocsOpen((v) => !v)}
          >
            {docsOpen && (
              <PlaceholderPanel message="Document Hub will be enabled next." />
            )}
          </SectionCard>

          <SectionCard
            title="Links"
            description="Coming soon in PR4"
            open={linksOpen}
            onToggle={() => setLinksOpen((v) => !v)}
          >
            {linksOpen && (
              <PlaceholderPanel message="Link Vault will be enabled next." />
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="media" className="mt-3">
          <MediaGrid
            items={mediaItems}
            pending={pending}
            onPreview={openPreview}
            onDownload={handleDownload}
            onCopy={handleCopy}
            onEdit={openEdit}
            onArchive={handleArchive}
            onDelete={handleDelete}
          />
        </TabsContent>

        <TabsContent value="documents" className="mt-3">
          <PlaceholderPanel message="Upload Document is intentionally disabled in PR2. Coming in PR3." />
        </TabsContent>

        <TabsContent value="links" className="mt-3">
          <PlaceholderPanel message="Add Link is intentionally disabled in PR2. Coming in PR4." />
        </TabsContent>
      </Tabs>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload media</DialogTitle>
            <DialogDescription>
              Allowed types: JPEG, PNG, WEBP. Max size:{' '}
              {Math.floor(config.maxSizeBytes / 1024 / 1024)}MB.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="media-file">Media file</Label>
              <Input
                id="media-file"
                type="file"
                accept={config.allowedMimeTypes.join(',')}
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="media-title">Title (optional)</Label>
              <Input
                id="media-title"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="Defaults to file name"
                maxLength={120}
              />
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={uploadCategory}
                onValueChange={(v) => setUploadCategory(v as MediaCategory)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {config.categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {humanize(category)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="media-tags">
                Tags (comma separated, max {config.maxTags})
              </Label>
              <Input
                id="media-tags"
                value={uploadTags}
                onChange={(e) => setUploadTags(e.target.value)}
                placeholder="hero, landing, campaign"
              />
            </div>

            {uploadDisabledReason && (
              <p className="text-sm text-amber-600">{uploadDisabledReason}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUploadSubmit}
              disabled={pending || Boolean(uploadDisabledReason)}
            >
              Upload Media
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit media metadata</DialogTitle>
            <DialogDescription>
              Update title, category, and tags for this media item.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={editCategory}
                onValueChange={(v) => setEditCategory(v as MediaCategory)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {config.categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {humanize(category)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-tags">Tags</Label>
              <Input
                id="edit-tags"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={pending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent
          className={cn(
            'overflow-y-auto p-0',
            isMobile
              ? 'left-0 top-auto translate-x-0 translate-y-0 bottom-0 rounded-t-xl rounded-b-none max-w-none h-[78vh]'
              : 'left-auto right-0 top-0 translate-x-0 translate-y-0 h-screen max-w-md rounded-none'
          )}
        >
          {selected && (
            <div className="h-full flex flex-col">
              <div className="p-4 border-b border-border">
                <h3 className="text-base font-semibold line-clamp-2">
                  {selected.title}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {humanize(selected.media_category)} ·{' '}
                  {formatSize(selected.size_bytes)}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {selected.signed_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selected.signed_url}
                    alt={selected.title}
                    className="w-full rounded-lg border border-border object-cover"
                  />
                ) : (
                  <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    Preview unavailable.
                  </div>
                )}

                {selected.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selected.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-border px-2 py-0.5 text-xs"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <ActionButton onClick={() => handleDownload(selected)}>
                    <Download className="h-4 w-4" /> Download
                  </ActionButton>
                  <ActionButton onClick={() => handleCopy(selected)}>
                    <Copy className="h-4 w-4" /> Copy link
                  </ActionButton>
                  <ActionButton onClick={() => openEdit(selected)}>
                    <Pencil className="h-4 w-4" /> Edit
                  </ActionButton>
                  <ActionButton onClick={() => handleArchive(selected)}>
                    <Archive className="h-4 w-4" />
                    {selected.archived_at ? 'Restore' : 'Archive'}
                  </ActionButton>
                </div>

                <Button
                  variant="outline"
                  className="w-full h-11 text-red-600 border-red-200 hover:text-red-700"
                  onClick={() => handleDelete(selected)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete permanently
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="fixed md:hidden bottom-4 left-4 right-4 z-20">
        <Button
          className="h-12 w-full text-base"
          onClick={() => setUploadOpen(true)}
          aria-label="Add media"
        >
          <Plus className="mr-2 h-5 w-5" />
          Add
        </Button>
      </div>
    </div>
  );

  function setTagFilterOrAll(value: string) {
    setTagFilter(value === 'all' ? '' : value);
  }
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
        onClick={onToggle}
        className="w-full min-h-11 px-4 py-3 flex items-center justify-between gap-4 text-left"
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
    <div className="border-t border-border px-4 py-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function MediaGrid({
  items,
  pending,
  onPreview,
  onDownload,
  onCopy,
  onEdit,
  onArchive,
  onDelete,
}: {
  items: MediaListItem[];
  pending: boolean;
  onPreview: (item: MediaListItem) => void;
  onDownload: (item: MediaListItem) => void;
  onCopy: (item: MediaListItem) => void;
  onEdit: (item: MediaListItem) => void;
  onArchive: (item: MediaListItem) => void;
  onDelete: (item: MediaListItem) => void;
}) {
  if (pending && items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Loading media...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
        <p className="font-medium">No media found</p>
        <p className="text-sm text-muted-foreground mt-1">
          Upload your first image to keep execution inside project context.
        </p>
      </div>
    );
  }

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
            <div className="flex items-start justify-between gap-2">
              <h4 className="font-medium text-sm line-clamp-2">{item.title}</h4>
              {item.archived_at && (
                <span className="text-[10px] rounded-full border border-border px-1.5 py-0.5 text-muted-foreground">
                  Archived
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5">
                {humanize(item.media_category)}
              </span>
              {item.tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-border text-xs px-2 py-0.5"
                >
                  #{tag}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-1.5">
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
        </article>
      ))}
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
      className="h-9 rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent flex items-center justify-center"
    >
      {children}
    </button>
  );
}

function ActionButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-11 rounded-md border border-border bg-card hover:bg-accent text-sm flex items-center justify-center gap-2"
    >
      {children}
    </button>
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
