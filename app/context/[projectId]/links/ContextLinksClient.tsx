'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Database } from '@/lib/supabase/types';
import { useI18n } from '@/components/I18nProvider';
import {
  Link2,
  ExternalLink,
  Plus,
  MoreVertical,
  Edit,
  Archive,
  Pin,
  PinOff,
  ExternalLinkIcon,
  ChevronDown,
  ChevronRight,
  GripVertical,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  updateProjectLinkAction,
  archiveProjectLinkAction,
  reorderProjectLinksAction,
} from './actions';
import LinkEditDialog from './LinkEditDialog';
import { SECTIONS } from '@/lib/validation/project-links';

type ProjectLinkRow = Database['public']['Tables']['project_links']['Row'];
type Section = Database['public']['Enums']['project_link_section_enum'];

const SECTION_ORDER_DEFAULT: Section[] = [...SECTIONS];
const SECTION_STORAGE_PREFIX = 'link_vault_section_order_';
const COLLAPSED_STORAGE_PREFIX = 'link_vault_collapsed_';

function getSectionOrder(projectId: string): Section[] {
  if (typeof window === 'undefined') return SECTION_ORDER_DEFAULT;
  try {
    const raw = localStorage.getItem(SECTION_STORAGE_PREFIX + projectId);
    if (!raw) return SECTION_ORDER_DEFAULT;
    const parsed = JSON.parse(raw) as string[];
    const valid = parsed.filter((s): s is Section =>
      SECTION_ORDER_DEFAULT.includes(s as Section)
    );
    return valid.length > 0 ? valid : SECTION_ORDER_DEFAULT;
  } catch {
    return SECTION_ORDER_DEFAULT;
  }
}

function getCollapsedDefault(
  projectId: string,
  sectionOrder: Section[]
): Set<Section> {
  if (typeof window === 'undefined') return new Set(sectionOrder);
  try {
    const raw = localStorage.getItem(COLLAPSED_STORAGE_PREFIX + projectId);
    if (raw == null) return new Set(sectionOrder);
    const parsed = JSON.parse(raw) as string[];
    return new Set(
      parsed.filter((s): s is Section =>
        SECTION_ORDER_DEFAULT.includes(s as Section)
      )
    );
  } catch {
    return new Set(sectionOrder);
  }
}

function saveSectionOrder(projectId: string, order: Section[]) {
  try {
    localStorage.setItem(
      SECTION_STORAGE_PREFIX + projectId,
      JSON.stringify(order)
    );
  } catch {}
}

function saveCollapsed(projectId: string, collapsed: Set<Section>) {
  try {
    localStorage.setItem(
      COLLAPSED_STORAGE_PREFIX + projectId,
      JSON.stringify([...collapsed])
    );
  } catch {}
}

function groupLinksBySection(
  links: ProjectLinkRow[],
  sectionOrder: Section[]
): Map<Section, ProjectLinkRow[]> {
  const map = new Map<Section, ProjectLinkRow[]>();
  for (const section of sectionOrder) {
    map.set(section, []);
  }
  for (const link of links) {
    const list = map.get(link.section);
    if (list) list.push(link);
    else map.set(link.section, [link]);
  }
  return map;
}

interface ContextLinksClientProps {
  projectId: string;
  initialLinks: ProjectLinkRow[];
  onRefresh?: () => void | Promise<void>;
}

function SortableSectionHeader({
  id,
  section,
  isCollapsed,
  onToggle,
  sectionLinksCount,
  activeLinksCount,
  onOpenAll,
  t,
}: {
  id: string;
  section: Section;
  isCollapsed: boolean;
  onToggle: () => void;
  sectionLinksCount: number;
  activeLinksCount: number;
  onOpenAll: () => void;
  t: (key: string) => string;
}) {
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  } as React.CSSProperties;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? 'opacity-80' : ''}
    >
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground cursor-grab active:cursor-grabbing"
          aria-label={t('links.reorder_sections')}
        >
          <GripVertical className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-2 flex-1 min-h-[44px] text-left rounded-md hover:bg-muted px-2 -ml-2 touch-manipulation"
          aria-label={
            isCollapsed
              ? t('links.expand_section')
              : t('links.collapse_section')
          }
        >
          {isCollapsed ? (
            <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          )}
          <h2 className="text-sm font-semibold text-foreground">
            {t(`links.section_${section}`)}
          </h2>
          <span className="text-xs text-muted-foreground">
            ({sectionLinksCount})
          </span>
        </button>
        {activeLinksCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground min-h-[44px] touch-manipulation"
            onClick={(e) => {
              e.stopPropagation();
              onOpenAll();
            }}
          >
            <ExternalLinkIcon className="w-4 h-4 mr-1" />
            {t('links.open_all_in_section')}
          </Button>
        )}
      </div>
    </div>
  );
}

function SortableLinkRow({
  link,
  onEdit,
  onArchive,
  onTogglePin,
  t,
}: {
  link: ProjectLinkRow;
  onEdit: (link: ProjectLinkRow) => void;
  onArchive: (link: ProjectLinkRow) => void;
  onTogglePin: (link: ProjectLinkRow) => void;
  t: (key: string) => string;
}) {
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: link.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  } as React.CSSProperties;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? 'opacity-85' : ''}
    >
      <div className="flex items-center gap-3 p-4 bg-card rounded-lg border border-border hover:shadow-md transition-all group">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground cursor-grab active:cursor-grabbing flex-shrink-0"
          aria-label={t('links.reorder_links')}
        >
          <GripVertical className="w-5 h-5" />
        </button>
        <a
          href={link.url}
          target={link.open_in_new_tab ? '_blank' : undefined}
          rel={link.open_in_new_tab ? 'noopener noreferrer' : undefined}
          className="flex-1 min-w-0 min-h-[44px] flex flex-col justify-center"
        >
          <div className="flex items-center gap-2">
            {link.pinned && (
              <Pin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            )}
            <p className="font-medium text-foreground truncate">{link.title}</p>
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {link.url}
          </p>
          {link.tags?.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-1">
              {link.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="bg-muted px-1.5 py-0.5 rounded">
                  {tag}
                </span>
              ))}
              {link.tags.length > 3 && (
                <span className="text-muted-foreground">
                  +{link.tags.length - 3}
                </span>
              )}
            </p>
          )}
        </a>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 min-h-[44px] min-w-[44px] flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity touch-manipulation"
              onClick={(e) => e.preventDefault()}
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                window.open(link.url, '_blank');
              }}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              {t('links.open_in_new_tab')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                onEdit(link);
              }}
            >
              <Edit className="w-4 h-4 mr-2" />
              {t('links.edit_link')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                onTogglePin(link);
              }}
            >
              {link.pinned ? (
                <>
                  <PinOff className="w-4 h-4 mr-2" />
                  {t('links.unpin')}
                </>
              ) : (
                <>
                  <Pin className="w-4 h-4 mr-2" />
                  {t('links.pinned')}
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                onArchive(link);
              }}
              className="text-destructive focus:text-destructive"
            >
              <Archive className="w-4 h-4 mr-2" />
              {t('links.archive_link')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export default function ContextLinksClient({
  projectId,
  initialLinks,
  onRefresh,
}: ContextLinksClientProps) {
  const { t } = useI18n();
  const [links, setLinks] = useState<ProjectLinkRow[]>(initialLinks);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<ProjectLinkRow | null>(null);

  const [sectionOrder, setSectionOrder] = useState<Section[]>(() =>
    getSectionOrder(projectId)
  );
  const [collapsedSections, setCollapsedSections] = useState<Set<Section>>(() =>
    getCollapsedDefault(projectId, getSectionOrder(projectId))
  );

  useEffect(() => {
    setLinks(initialLinks);
  }, [initialLinks]);

  useEffect(() => {
    setSectionOrder(getSectionOrder(projectId));
    setCollapsedSections(
      getCollapsedDefault(projectId, getSectionOrder(projectId))
    );
  }, [projectId]);

  const linksBySection = useMemo(
    () => groupLinksBySection(links, sectionOrder),
    [links, sectionOrder]
  );

  const handleSuccess = useCallback(() => {
    onRefresh?.();
  }, [onRefresh]);

  const handleOpenAllInSection = useCallback(
    (sectionLinks: ProjectLinkRow[]) => {
      const toOpen = sectionLinks.filter((l) => !l.archived_at);
      toOpen.forEach((l) =>
        window.open(l.url, '_blank', 'noopener,noreferrer')
      );
    },
    []
  );

  const handleEdit = useCallback((link: ProjectLinkRow) => {
    setEditingLink(link);
    setDialogOpen(true);
  }, []);

  const handleAddNew = useCallback(() => {
    setEditingLink(null);
    setDialogOpen(true);
  }, []);

  const handleArchive = useCallback(
    async (link: ProjectLinkRow) => {
      const result = await archiveProjectLinkAction(link.id);
      if (result.error) return;
      setLinks((prev) => prev.filter((l) => l.id !== link.id));
      onRefresh?.();
    },
    [onRefresh]
  );

  const handleTogglePin = useCallback(
    async (link: ProjectLinkRow) => {
      const result = await updateProjectLinkAction(link.id, {
        pinned: !link.pinned,
      });
      if (result.error) return;
      if (result.data)
        setLinks((prev) =>
          prev.map((l) => (l.id === link.id ? result.data! : l))
        );
      onRefresh?.();
    },
    [onRefresh]
  );

  const toggleSectionCollapsed = useCallback(
    (section: Section) => {
      setCollapsedSections((prev) => {
        const next = new Set(prev);
        if (next.has(section)) next.delete(section);
        else next.add(section);
        saveCollapsed(projectId, next);
        return next;
      });
    },
    [projectId]
  );

  const sectionSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleSectionDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const activeId = String(active.id);
      const overId = String(over.id);
      if (!activeId.startsWith('section:') || !overId.startsWith('section:'))
        return;
      const activeSection = activeId.replace('section:', '') as Section;
      const overSection = overId.replace('section:', '') as Section;
      const oldIndex = sectionOrder.indexOf(activeSection);
      const newIndex = sectionOrder.indexOf(overSection);
      if (oldIndex === -1 || newIndex === -1) return;
      const next = arrayMove(sectionOrder, oldIndex, newIndex);
      setSectionOrder(next);
      saveSectionOrder(projectId, next);
    },
    [projectId, sectionOrder]
  );

  const buildFullOrderedIds = useCallback(
    (section: Section, reorderedLinkIds: string[]) => {
      const result: string[] = [];
      for (const sec of sectionOrder) {
        const sectionLinks = linksBySection.get(sec) ?? [];
        if (sec === section) {
          result.push(...reorderedLinkIds);
        } else {
          result.push(...sectionLinks.map((l) => l.id));
        }
      }
      return result;
    },
    [sectionOrder, linksBySection]
  );

  const handleLinkDragEnd = useCallback(
    async (event: DragEndEvent, section: Section) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const sectionLinks = linksBySection.get(section) ?? [];
      const ids = sectionLinks.map((l) => l.id);
      const oldIndex = ids.indexOf(active.id as string);
      const newIndex = ids.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;
      const reorderedIds = arrayMove(ids, oldIndex, newIndex);
      setLinks((prev) => {
        const bySection = groupLinksBySection(prev, sectionOrder);
        const newSectionLinks = reorderedIds
          .map((id) => prev.find((l) => l.id === id))
          .filter((l): l is ProjectLinkRow => !!l);
        bySection.set(section, newSectionLinks);
        const out: ProjectLinkRow[] = [];
        for (const sec of sectionOrder) {
          out.push(...(bySection.get(sec) ?? []));
        }
        return out;
      });
      const fullOrdered = buildFullOrderedIds(section, reorderedIds);
      const { error } = await reorderProjectLinksAction(projectId, fullOrdered);
      if (error) onRefresh?.();
    },
    [projectId, sectionOrder, linksBySection, buildFullOrderedIds, onRefresh]
  );

  return (
    <div className="p-4 md:p-6 min-h-full">
      {links.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 bg-card rounded-lg border border-border">
          <Link2 className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground text-center mb-2">
            {t('links.no_links_yet')}
          </p>
          <p className="text-sm text-muted-foreground text-center mb-4">
            {t('links.no_links_hint')}
          </p>
          <Button onClick={handleAddNew} size="sm" className="min-h-[44px]">
            <Plus className="w-4 h-4 mr-2" />
            {t('links.add_link')}
          </Button>
        </div>
      ) : (
        <DndContext
          sensors={sectionSensors}
          collisionDetection={closestCenter}
          onDragEnd={handleSectionDragEnd}
        >
          <SortableContext
            items={sectionOrder.map((s) => `section:${s}`)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-6">
              {sectionOrder.map((section) => {
                const sectionLinks = linksBySection.get(section) ?? [];
                if (sectionLinks.length === 0) return null;
                const isCollapsed = collapsedSections.has(section);
                const activeLinks = sectionLinks.filter((l) => !l.archived_at);

                return (
                  <section key={section}>
                    <SortableSectionHeader
                      id={`section:${section}`}
                      section={section}
                      isCollapsed={isCollapsed}
                      onToggle={() => toggleSectionCollapsed(section)}
                      sectionLinksCount={sectionLinks.length}
                      activeLinksCount={activeLinks.length}
                      onOpenAll={() => handleOpenAllInSection(sectionLinks)}
                      t={t}
                    />
                    {!isCollapsed && (
                      <DndContext
                        sensors={sectionSensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(e) => handleLinkDragEnd(e, section)}
                      >
                        <SortableContext
                          items={sectionLinks.map((l) => l.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="space-y-2 pl-4 border-l-2 border-muted/50">
                            {sectionLinks.map((link) => (
                              <SortableLinkRow
                                key={link.id}
                                link={link}
                                onEdit={handleEdit}
                                onArchive={handleArchive}
                                onTogglePin={handleTogglePin}
                                t={t}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    )}
                  </section>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {links.length > 0 && (
        <Button
          type="button"
          aria-label={t('links.add_link')}
          onClick={handleAddNew}
          className="fixed bottom-6 right-6 z-40 flex h-14 w-14 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background md:bottom-8 md:right-8"
        >
          <Plus className="h-6 w-6" />
        </Button>
      )}

      <LinkEditDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        mode={editingLink ? 'edit' : 'create'}
        link={editingLink ?? undefined}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
