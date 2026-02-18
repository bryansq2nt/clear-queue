'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import {
  Archive,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  FileIcon,
  FileText,
  ImagePlus,
  Link2,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
  Pencil,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  archiveProjectDocumentAction,
  archiveProjectLinkAction,
  archiveProjectMediaAction,
  createProjectLinkAction,
  deleteProjectDocumentAction,
  deleteProjectLinkAction,
  deleteProjectMediaAction,
  getProjectMediaSignedUrlAction,
  getSignedDocUrlAction,
  listProjectDocumentsAction,
  listProjectLinksAction,
  listProjectMediaAction,
  restoreProjectLinkAction,
  type DocumentListItem,
  type LinkListItem,
  type MediaListItem,
  updateDocumentMetadataAction,
  updateProjectLinkAction,
  updateProjectMediaMetadataAction,
  uploadProjectDocumentAction,
  uploadProjectMediaAction,
} from './actions';
import {
  DOCUMENT_HUB_ALLOWED_MIME_TYPES,
  DOCUMENT_HUB_CATEGORIES,
  DOCUMENT_HUB_MAX_SIZE_BYTES,
  FILES_VAULT_MAX_TAGS,
  LINK_VAULT_OPEN_ALL_CONFIRM_THRESHOLD,
  LINK_VAULT_SECTIONS,
  LINK_VAULT_TYPES,
  MEDIA_VAULT_ALLOWED_MIME_TYPES,
  MEDIA_VAULT_CATEGORIES,
  MEDIA_VAULT_MAX_SIZE_BYTES,
  TEMP_LINK_TTL_SECONDS,
} from './config';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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

type MediaCategory = (typeof MEDIA_VAULT_CATEGORIES)[number];
type DocumentCategory = (typeof DOCUMENT_HUB_CATEGORIES)[number];
type LinkType = (typeof LINK_VAULT_TYPES)[number];
type LinkSection = (typeof LINK_VAULT_SECTIONS)[number];
type TabKey = 'all' | 'media' | 'documents' | 'links';

type LinkFormState = {
  title: string;
  url: string;
  provider: string;
  description: string;
  link_type: LinkType;
  section: LinkSection;
  tags: string;
  pinned: boolean;
};

interface Props {
  projectId: string;
  initialMedia: MediaListItem[];
  initialDocuments: DocumentListItem[];
  initialLinks: LinkListItem[];
}

export function ProjectMediaVaultClient({
  projectId,
  initialMedia,
  initialDocuments,
  initialLinks,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [mediaOpen, setMediaOpen] = useState(true);
  const [docsOpen, setDocsOpen] = useState(true);
  const [linksOpen, setLinksOpen] = useState(true);
  const [pending, startTransition] = useTransition();

  const [media, setMedia] = useState(initialMedia);
  const [documents, setDocuments] = useState(initialDocuments);
  const [links, setLinks] = useState(initialLinks);

  const [mediaSearch, setMediaSearch] = useState('');
  const [mediaCategory, setMediaCategory] = useState<'all' | MediaCategory>(
    'all'
  );
  const [mediaTag, setMediaTag] = useState('');

  const [docSearch, setDocSearch] = useState('');
  const [docCategory, setDocCategory] = useState<'all' | DocumentCategory>(
    'all'
  );
  const [docTag, setDocTag] = useState('');

  const [linkSearch, setLinkSearch] = useState('');
  const [linkSection, setLinkSection] = useState<'all' | LinkSection>('all');
  const [linkTag, setLinkTag] = useState('');
  const [pinnedOnly, setPinnedOnly] = useState(false);

  const [isMobile, setIsMobile] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<MediaListItem | null>(
    null
  );
  const [selectedDoc, setSelectedDoc] = useState<DocumentListItem | null>(null);

  const [uploadMediaOpen, setUploadMediaOpen] = useState(false);
  const [uploadDocOpen, setUploadDocOpen] = useState(false);
  const [createLinkOpen, setCreateLinkOpen] = useState(false);
  const [editLinkOpen, setEditLinkOpen] = useState(false);

  const [uploadMediaFile, setUploadMediaFile] = useState<File | null>(null);
  const [uploadMediaTitle, setUploadMediaTitle] = useState('');
  const [uploadMediaTags, setUploadMediaTags] = useState('');
  const [uploadMediaCategory, setUploadMediaCategory] =
    useState<MediaCategory>('branding');

  const [uploadDocFile, setUploadDocFile] = useState<File | null>(null);
  const [uploadDocTitle, setUploadDocTitle] = useState('');
  const [uploadDocTags, setUploadDocTags] = useState('');
  const [uploadDocDesc, setUploadDocDesc] = useState('');
  const [uploadDocCategory, setUploadDocCategory] =
    useState<DocumentCategory>('brief');

  const [newLink, setNewLink] = useState<LinkFormState>({
    title: '',
    url: '',
    provider: '',
    description: '',
    link_type: 'tool' as LinkType,
    section: 'operations' as LinkSection,
    tags: '',
    pinned: false,
  });
  const [editingLink, setEditingLink] = useState<LinkListItem | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const mediaTags = useMemo(
    () => Array.from(new Set(media.flatMap((i) => i.tags))).sort(),
    [media]
  );
  const docTags = useMemo(
    () => Array.from(new Set(documents.flatMap((i) => i.tags))).sort(),
    [documents]
  );
  const linkTags = useMemo(
    () => Array.from(new Set(links.flatMap((i) => i.tags))).sort(),
    [links]
  );

  const groupedLinks = useMemo(() => {
    const groups = new Map<LinkSection, LinkListItem[]>();
    for (const section of LINK_VAULT_SECTIONS) groups.set(section, []);
    for (const link of links) {
      const arr = groups.get(link.section as LinkSection) || [];
      arr.push(link);
      groups.set(link.section as LinkSection, arr);
    }
    return groups;
  }, [links]);

  useEffect(() => {
    refreshMedia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaSearch, mediaCategory, mediaTag]);

  useEffect(() => {
    refreshDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docSearch, docCategory, docTag]);

  useEffect(() => {
    refreshLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkSearch, linkSection, linkTag, pinnedOnly]);

  function refreshMedia() {
    startTransition(async () => {
      const res = await listProjectMediaAction({
        projectId,
        search: mediaSearch,
        category: mediaCategory,
        tag: mediaTag,
      });
      if (res.ok) setMedia(res.data);
    });
  }

  function refreshDocuments() {
    startTransition(async () => {
      const res = await listProjectDocumentsAction({
        projectId,
        search: docSearch,
        category: docCategory,
        tag: docTag,
      });
      if (res.ok) setDocuments(res.data);
    });
  }

  function refreshLinks() {
    startTransition(async () => {
      const res = await listProjectLinksAction({
        projectId,
        search: linkSearch,
        section: linkSection,
        tag: linkTag,
        pinnedOnly,
      });
      if (res.ok) setLinks(res.data);
    });
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4 pb-24 md:pb-6">
      <div className="rounded-lg border border-border bg-card p-4 sm:p-5 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Project Files</h2>
            <p className="text-sm text-muted-foreground">
              Media, documents and project links in one context.
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
                <ImagePlus className="mr-2 h-4 w-4" />
                Upload Media
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setUploadDocOpen(true)}>
                <FileText className="mr-2 h-4 w-4" />
                Upload Document
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCreateLinkOpen(true)}>
                <Link2 className="mr-2 h-4 w-4" />
                Add Link
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
          <Section
            title="Media"
            description="Project images"
            open={mediaOpen}
            toggle={() => setMediaOpen(!mediaOpen)}
          >
            {mediaOpen && (
              <MediaPane
                items={media}
                onPreview={(m) => {
                  setSelectedDoc(null);
                  setSelectedMedia(m);
                  setPreviewOpen(true);
                }}
                onRefresh={refreshMedia}
              />
            )}
          </Section>
          <Section
            title="Documents"
            description="Project docs"
            open={docsOpen}
            toggle={() => setDocsOpen(!docsOpen)}
          >
            {docsOpen && (
              <DocumentsPane
                items={documents}
                onPreview={(d) => {
                  setSelectedMedia(null);
                  setSelectedDoc(d);
                  setPreviewOpen(true);
                }}
                onRefresh={refreshDocuments}
              />
            )}
          </Section>
          <Section
            title="Links"
            description="Launch points by section"
            open={linksOpen}
            toggle={() => setLinksOpen(!linksOpen)}
          >
            {linksOpen && (
              <LinksGroupedPane
                groups={groupedLinks}
                onOpenAll={openAllInSection}
                onOpen={openLink}
                onCopy={copyPlainUrl}
                onEdit={(l) => {
                  setEditingLink(l);
                  setEditLinkOpen(true);
                }}
                onTogglePin={togglePin}
                onArchive={archiveLink}
                onDelete={deleteLink}
              />
            )}
          </Section>
        </TabsContent>

        <TabsContent value="media" className="mt-3 space-y-3">
          <FilterRow
            search={mediaSearch}
            setSearch={setMediaSearch}
            category={mediaCategory}
            setCategory={(v) => setMediaCategory(v as 'all' | MediaCategory)}
            categories={['all', ...MEDIA_VAULT_CATEGORIES]}
            tag={mediaTag}
            setTag={setMediaTag}
            tags={mediaTags}
          />
          <MediaPane
            items={media}
            onPreview={(m) => {
              setSelectedDoc(null);
              setSelectedMedia(m);
              setPreviewOpen(true);
            }}
            onRefresh={refreshMedia}
          />
        </TabsContent>

        <TabsContent value="documents" className="mt-3 space-y-3">
          <FilterRow
            search={docSearch}
            setSearch={setDocSearch}
            category={docCategory}
            setCategory={(v) => setDocCategory(v as 'all' | DocumentCategory)}
            categories={['all', ...DOCUMENT_HUB_CATEGORIES]}
            tag={docTag}
            setTag={setDocTag}
            tags={docTags}
          />
          <DocumentsPane
            items={documents}
            onPreview={(d) => {
              setSelectedMedia(null);
              setSelectedDoc(d);
              setPreviewOpen(true);
            }}
            onRefresh={refreshDocuments}
          />
        </TabsContent>

        <TabsContent value="links" className="mt-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <SearchBox
              value={linkSearch}
              onChange={setLinkSearch}
              placeholder="Search title or URL"
            />
            <Select
              value={linkSection}
              onValueChange={(v) => setLinkSection(v as 'all' | LinkSection)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sections</SelectItem>
                {LINK_VAULT_SECTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {humanize(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <TagSelect value={linkTag} onChange={setLinkTag} tags={linkTags} />
            <Button
              variant={pinnedOnly ? 'default' : 'outline'}
              className="h-11"
              onClick={() => setPinnedOnly(!pinnedOnly)}
            >
              {pinnedOnly ? (
                <PinOff className="mr-2 h-4 w-4" />
              ) : (
                <Pin className="mr-2 h-4 w-4" />
              )}
              {pinnedOnly ? 'Show all' : 'Pinned only'}
            </Button>
          </div>

          <LinksGroupedPane
            groups={groupedLinks}
            onOpenAll={openAllInSection}
            onOpen={openLink}
            onCopy={copyPlainUrl}
            onEdit={(l) => {
              setEditingLink(l);
              setEditLinkOpen(true);
            }}
            onTogglePin={togglePin}
            onArchive={archiveLink}
            onDelete={deleteLink}
          />
        </TabsContent>
      </Tabs>

      <UploadMediaDialog
        open={uploadMediaOpen}
        setOpen={setUploadMediaOpen}
        onSubmit={() => {
          if (!uploadMediaFile) return;
          startTransition(async () => {
            const r = await uploadProjectMediaAction({
              projectId,
              file: uploadMediaFile,
              title: uploadMediaTitle,
              category: uploadMediaCategory,
              tags: uploadMediaTags,
            });
            if (!r.ok) return window.alert(r.error);
            setUploadMediaOpen(false);
            setUploadMediaFile(null);
            setUploadMediaTitle('');
            setUploadMediaTags('');
            refreshMedia();
          });
        }}
        file={uploadMediaFile}
        setFile={setUploadMediaFile}
        title={uploadMediaTitle}
        setTitle={setUploadMediaTitle}
        tags={uploadMediaTags}
        setTags={setUploadMediaTags}
        category={uploadMediaCategory}
        setCategory={setUploadMediaCategory}
      />

      <UploadDocDialog
        open={uploadDocOpen}
        setOpen={setUploadDocOpen}
        onSubmit={() => {
          if (!uploadDocFile) return;
          startTransition(async () => {
            const r = await uploadProjectDocumentAction({
              projectId,
              file: uploadDocFile,
              title: uploadDocTitle,
              category: uploadDocCategory,
              tags: uploadDocTags,
              description: uploadDocDesc,
            });
            if (!r.ok) return window.alert(r.error);
            setUploadDocOpen(false);
            setUploadDocFile(null);
            setUploadDocTitle('');
            setUploadDocTags('');
            setUploadDocDesc('');
            refreshDocuments();
          });
        }}
        file={uploadDocFile}
        setFile={setUploadDocFile}
        title={uploadDocTitle}
        setTitle={setUploadDocTitle}
        tags={uploadDocTags}
        setTags={setUploadDocTags}
        description={uploadDocDesc}
        setDescription={setUploadDocDesc}
        category={uploadDocCategory}
        setCategory={setUploadDocCategory}
      />

      <LinkFormDialog
        title="Add link"
        open={createLinkOpen}
        setOpen={setCreateLinkOpen}
        link={newLink}
        setLink={setNewLink}
        onSubmit={() => {
          startTransition(async () => {
            const r = await createProjectLinkAction({ projectId, ...newLink });
            if (!r.ok) return window.alert(r.error);
            setCreateLinkOpen(false);
            setNewLink({
              title: '',
              url: '',
              provider: '',
              description: '',
              link_type: 'tool',
              section: 'operations',
              tags: '',
              pinned: false,
            });
            refreshLinks();
          });
        }}
      />

      <LinkFormDialog
        title="Edit link"
        open={editLinkOpen}
        setOpen={setEditLinkOpen}
        link={
          editingLink
            ? {
                title: editingLink.title,
                url: editingLink.url,
                provider: editingLink.provider || '',
                description: editingLink.description || '',
                link_type: editingLink.link_type,
                section: editingLink.section,
                tags: editingLink.tags.join(', '),
                pinned: editingLink.pinned,
              }
            : null
        }
        setLink={(up: LinkFormState) =>
          setEditingLink((prev) =>
            prev
              ? {
                  ...prev,
                  ...{
                    title: up.title,
                    url: up.url,
                    provider: up.provider || null,
                    description: up.description || null,
                    link_type: up.link_type,
                    section: up.section,
                    tags: up.tags
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean),
                    pinned: up.pinned,
                  },
                }
              : prev
          )
        }
        onSubmit={() => {
          if (!editingLink) return;
          startTransition(async () => {
            const r = await updateProjectLinkAction({
              linkId: editingLink.id,
              title: editingLink.title,
              url: editingLink.url,
              provider: editingLink.provider || '',
              description: editingLink.description || '',
              link_type: editingLink.link_type,
              section: editingLink.section,
              tags: editingLink.tags,
              pinned: editingLink.pinned,
            });
            if (!r.ok) return window.alert(r.error);
            setEditLinkOpen(false);
            setEditingLink(null);
            refreshLinks();
          });
        }}
      />

      <PreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        isMobile={isMobile}
        media={selectedMedia}
        document={selectedDoc}
      />

      <div className="fixed md:hidden bottom-4 left-4 right-4 z-20">
        <Button
          className="h-12 w-full text-base"
          onClick={() => {
            if (activeTab === 'documents') setUploadDocOpen(true);
            else if (activeTab === 'links') setCreateLinkOpen(true);
            else setUploadMediaOpen(true);
          }}
        >
          <Plus className="mr-2 h-5 w-5" /> Add
        </Button>
      </div>
    </div>
  );

  function openLink(link: LinkListItem) {
    window.open(link.url, '_blank', 'noopener,noreferrer');
  }

  async function copyPlainUrl(link: LinkListItem) {
    try {
      await navigator.clipboard.writeText(link.url);
      window.alert('URL copied');
    } catch {
      window.prompt('Copy URL', link.url);
    }
  }

  function openAllInSection(section: LinkSection) {
    const items = groupedLinks.get(section) || [];
    const active = items.filter((i) => !i.archived_at);
    if (active.length === 0) return;
    if (
      active.length > LINK_VAULT_OPEN_ALL_CONFIRM_THRESHOLD &&
      !window.confirm(`Open ${active.length} links from ${humanize(section)}?`)
    )
      return;
    active.forEach((i) => window.open(i.url, '_blank', 'noopener,noreferrer'));
  }

  function togglePin(link: LinkListItem) {
    startTransition(async () => {
      const r = await updateProjectLinkAction({
        linkId: link.id,
        pinned: !link.pinned,
      });
      if (!r.ok) return window.alert(r.error);
      refreshLinks();
    });
  }

  function archiveLink(link: LinkListItem) {
    startTransition(async () => {
      const r = link.archived_at
        ? await restoreProjectLinkAction({ linkId: link.id })
        : await archiveProjectLinkAction({ linkId: link.id });
      if (!r.ok) return window.alert(r.error);
      refreshLinks();
    });
  }

  function deleteLink(link: LinkListItem) {
    if (!window.confirm(`Delete link "${link.title}"?`)) return;
    startTransition(async () => {
      const r = await deleteProjectLinkAction({ linkId: link.id });
      if (!r.ok) return window.alert(r.error);
      refreshLinks();
    });
  }
}

function Section({
  title,
  description,
  open,
  toggle,
  children,
}: {
  title: string;
  description: string;
  open: boolean;
  toggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <button
        type="button"
        className="w-full min-h-11 px-4 py-3 flex items-center justify-between text-left"
        onClick={toggle}
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

function FilterRow({
  search,
  setSearch,
  category,
  setCategory,
  categories,
  tag,
  setTag,
  tags,
}: {
  search: string;
  setSearch: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
  categories: string[];
  tag: string;
  setTag: (v: string) => void;
  tags: string[];
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
      <SearchBox value={search} onChange={setSearch} placeholder="Search" />
      <Select value={category} onValueChange={setCategory}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {categories.map((c) => (
            <SelectItem key={c} value={c}>
              {c === 'all' ? 'All categories' : humanize(c)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <TagSelect value={tag} onChange={setTag} tags={tags} />
    </div>
  );
}

function SearchBox({
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

function TagSelect({
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
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All tags</SelectItem>
        {tags.map((t) => (
          <SelectItem key={t} value={t}>
            #{t}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MediaPane({
  items,
  onPreview,
  onRefresh,
}: {
  items: MediaListItem[];
  onPreview: (m: MediaListItem) => void;
  onRefresh: () => void;
}) {
  if (items.length === 0)
    return (
      <div className="p-4 text-sm text-muted-foreground">No media files.</div>
    );
  return (
    <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {items.map((i) => (
        <article
          key={i.id}
          className="rounded-lg border border-border bg-card overflow-hidden"
        >
          <button
            type="button"
            className="block w-full aspect-[4/3] bg-muted"
            onClick={() => onPreview(i)}
          >
            {i.signed_url ? (
              <img
                src={i.signed_url}
                alt={i.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center">
                <Eye className="h-5 w-5" />
              </div>
            )}
          </button>
          <div className="p-3">
            <p className="text-sm font-medium line-clamp-2">{i.title}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              <Badge>{humanize(i.media_category)}</Badge>
              {i.tags.slice(0, 2).map((t) => (
                <Tag key={t} t={t} />
              ))}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function DocumentsPane({
  items,
  onPreview,
  onRefresh,
}: {
  items: DocumentListItem[];
  onPreview: (d: DocumentListItem) => void;
  onRefresh: () => void;
}) {
  if (items.length === 0)
    return (
      <div className="p-4 text-sm text-muted-foreground">No documents.</div>
    );
  return (
    <div className="p-4 pt-0 rounded-lg border border-border divide-y divide-border overflow-hidden">
      {items.map((d) => (
        <div key={d.id} className="p-3 flex items-start gap-3">
          <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center">
            <FileIcon className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <button
              type="button"
              onClick={() => onPreview(d)}
              className="text-left w-full"
            >
              <p className="font-medium truncate">{d.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatSize(d.size_bytes)} · {formatDate(d.created_at)}
              </p>
            </button>
            <div className="mt-1 flex flex-wrap gap-1">
              <Badge>{humanize(d.document_category)}</Badge>
              {d.tags.slice(0, 3).map((t) => (
                <Tag key={t} t={t} />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function LinksGroupedPane({
  groups,
  onOpenAll,
  onOpen,
  onCopy,
  onEdit,
  onTogglePin,
  onArchive,
  onDelete,
}: {
  groups: Map<LinkSection, LinkListItem[]>;
  onOpenAll: (s: LinkSection) => void;
  onOpen: (l: LinkListItem) => void;
  onCopy: (l: LinkListItem) => void;
  onEdit: (l: LinkListItem) => void;
  onTogglePin: (l: LinkListItem) => void;
  onArchive: (l: LinkListItem) => void;
  onDelete: (l: LinkListItem) => void;
}) {
  return (
    <div className="space-y-3">
      {LINK_VAULT_SECTIONS.map((section) => {
        const items = groups.get(section) || [];
        if (items.length === 0) return null;
        return (
          <div
            key={section}
            className="rounded-lg border border-border bg-card"
          >
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <p className="font-medium">{humanize(section)}</p>
              <Button
                variant="outline"
                className="h-9"
                onClick={() => onOpenAll(section)}
              >
                Open all
              </Button>
            </div>
            <div className="divide-y divide-border">
              {items.map((l) => (
                <div key={l.id} className="p-3 sm:p-4 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{l.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {l.hostname || l.url}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge>{humanize(l.link_type)}</Badge>
                        {l.provider ? <Badge>{l.provider}</Badge> : null}
                        {l.tags.slice(0, 3).map((t) => (
                          <Tag key={t} t={t} />
                        ))}
                        {l.pinned ? <Badge>Pinned</Badge> : null}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                    <ActionMini title="Open" onClick={() => onOpen(l)}>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </ActionMini>
                    <ActionMini title="Copy" onClick={() => onCopy(l)}>
                      <Copy className="h-3.5 w-3.5" />
                    </ActionMini>
                    <ActionMini title="Edit" onClick={() => onEdit(l)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </ActionMini>
                    <ActionMini
                      title={l.pinned ? 'Unpin' : 'Pin'}
                      onClick={() => onTogglePin(l)}
                    >
                      {l.pinned ? (
                        <PinOff className="h-3.5 w-3.5" />
                      ) : (
                        <Pin className="h-3.5 w-3.5" />
                      )}
                    </ActionMini>
                    <ActionMini
                      title={l.archived_at ? 'Restore' : 'Archive'}
                      onClick={() => onArchive(l)}
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </ActionMini>
                    <ActionMini title="Delete" onClick={() => onDelete(l)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </ActionMini>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ActionMini({
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
      title={title}
      onClick={onClick}
      className="h-11 rounded-md border border-border bg-background hover:bg-accent flex items-center justify-center"
    >
      {children}
    </button>
  );
}

function UploadMediaDialog({
  open,
  setOpen,
  onSubmit,
  file,
  setFile,
  title,
  setTitle,
  tags,
  setTags,
  category,
  setCategory,
}: any) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload media</DialogTitle>
          <DialogDescription>
            JPEG/PNG/WEBP up to{' '}
            {Math.floor(MEDIA_VAULT_MAX_SIZE_BYTES / 1024 / 1024)}MB.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            type="file"
            accept={MEDIA_VAULT_ALLOWED_MIME_TYPES.join(',')}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <Input
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MEDIA_VAULT_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {humanize(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder={`Tags (max ${FILES_VAULT_MAX_TAGS})`}
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={onSubmit}>Upload Media</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UploadDocDialog({
  open,
  setOpen,
  onSubmit,
  file,
  setFile,
  title,
  setTitle,
  tags,
  setTags,
  description,
  setDescription,
  category,
  setCategory,
}: any) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload document</DialogTitle>
          <DialogDescription>
            PDF/TXT/CSV/DOCX/XLSX up to{' '}
            {Math.floor(DOCUMENT_HUB_MAX_SIZE_BYTES / 1024 / 1024)}MB.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            type="file"
            accept={DOCUMENT_HUB_ALLOWED_MIME_TYPES.join(',')}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <Input
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_HUB_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {humanize(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder={`Tags (max ${FILES_VAULT_MAX_TAGS})`}
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
          <Input
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={onSubmit}>Upload Document</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinkFormDialog({
  title,
  open,
  setOpen,
  link,
  setLink,
  onSubmit,
}: any) {
  if (!link) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Links are launch points only. No embedded dashboards.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="Title"
            value={link.title}
            onChange={(e) => setLink({ ...link, title: e.target.value })}
          />
          <Input
            placeholder="https://..."
            value={link.url}
            onChange={(e) => setLink({ ...link, url: e.target.value })}
          />
          <Input
            placeholder="Provider (optional)"
            value={link.provider}
            onChange={(e) => setLink({ ...link, provider: e.target.value })}
          />
          <Input
            placeholder="Description (optional)"
            value={link.description}
            onChange={(e) => setLink({ ...link, description: e.target.value })}
          />
          <Select
            value={link.link_type}
            onValueChange={(v) => setLink({ ...link, link_type: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LINK_VAULT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {humanize(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={link.section}
            onValueChange={(v) => setLink({ ...link, section: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LINK_VAULT_SECTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {humanize(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder={`Tags (max ${FILES_VAULT_MAX_TAGS})`}
            value={link.tags}
            onChange={(e) => setLink({ ...link, tags: e.target.value })}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={link.pinned}
              onChange={(e) => setLink({ ...link, pinned: e.target.checked })}
            />
            Pinned
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={onSubmit}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewDialog({
  open,
  onOpenChange,
  isMobile,
  media,
  document,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isMobile: boolean;
  media: MediaListItem | null;
  document: DocumentListItem | null;
}) {
  const isPdf = document?.mime_type === 'application/pdf';
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
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {media?.signed_url ? (
              <img
                src={media.signed_url}
                alt={media.title}
                className="w-full rounded-lg border border-border object-cover"
              />
            ) : null}
            {document ? (
              isPdf && document.signed_url ? (
                <iframe
                  src={document.signed_url}
                  className="w-full h-80 rounded-lg border border-border"
                  title={document.title}
                />
              ) : (
                <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Download to view this document type.
                </div>
              )
            ) : null}
            <p className="text-xs text-muted-foreground">
              Temporary file links expire in about{' '}
              {Math.floor(TEMP_LINK_TTL_SECONDS / 60)} minutes.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5">
      {children}
    </span>
  );
}
function Tag({ t }: { t: string }) {
  return (
    <span className="rounded-full border border-border text-xs px-2 py-0.5">
      #{t}
    </span>
  );
}

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}
