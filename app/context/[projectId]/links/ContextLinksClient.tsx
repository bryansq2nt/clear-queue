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
  Trash2,
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  updateProjectLinkAction,
  archiveProjectLinkAction,
  reorderProjectLinksAction,
  listLinkCategoriesAction,
  updateLinkCategoryAction,
  deleteLinkCategoryAction,
} from './actions';
import LinkEditDialog from './LinkEditDialog';
import { SkeletonLinks } from '@/components/skeletons/SkeletonLinks';

const UNCATEGORIZED_KEY = 'uncategorized';
const SECTION_STORAGE_PREFIX = 'link_vault_section_order_';
const COLLAPSED_STORAGE_PREFIX = 'link_vault_collapsed_';

type ProjectLinkRow = Database['public']['Tables']['project_links']['Row'];
type LinkCategoryRow = Database['public']['Tables']['link_categories']['Row'];

/** Section key is either a category id or UNCATEGORIZED_KEY for null category_id */
type SectionKey = string;

function getDefaultCategoryOrder(categories: LinkCategoryRow[]): SectionKey[] {
  const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order);
  return sorted.map((c) => c.id).concat(UNCATEGORIZED_KEY);
}

function getSectionOrder(
  projectId: string,
  categories: LinkCategoryRow[]
): SectionKey[] {
  const defaultOrder = getDefaultCategoryOrder(categories);
  if (typeof window === 'undefined') return defaultOrder;
  try {
    const raw = localStorage.getItem(SECTION_STORAGE_PREFIX + projectId);
    if (!raw) return defaultOrder;
    const parsed = JSON.parse(raw) as string[];
    const valid = parsed.filter(
      (s) => s === UNCATEGORIZED_KEY || categories.some((c) => c.id === s)
    );
    const missing = defaultOrder.filter((k) => !valid.includes(k));
    return valid.length > 0 ? [...valid, ...missing] : defaultOrder;
  } catch {
    return defaultOrder;
  }
}

function getCollapsedDefault(
  projectId: string,
  sectionOrder: SectionKey[]
): Set<SectionKey> {
  if (typeof window === 'undefined') return new Set(sectionOrder);
  try {
    const raw = localStorage.getItem(COLLAPSED_STORAGE_PREFIX + projectId);
    if (raw == null) return new Set(sectionOrder);
    const parsed = JSON.parse(raw) as string[];
    return new Set(parsed.filter((s) => sectionOrder.includes(s)));
  } catch {
    return new Set(sectionOrder);
  }
}

function saveSectionOrder(projectId: string, order: SectionKey[]) {
  try {
    localStorage.setItem(
      SECTION_STORAGE_PREFIX + projectId,
      JSON.stringify(order)
    );
  } catch {}
}

function saveCollapsed(projectId: string, collapsed: Set<SectionKey>) {
  try {
    localStorage.setItem(
      COLLAPSED_STORAGE_PREFIX + projectId,
      JSON.stringify([...collapsed])
    );
  } catch {}
}

function groupLinksByCategory(
  links: ProjectLinkRow[],
  sectionOrder: SectionKey[]
): Map<SectionKey, ProjectLinkRow[]> {
  const map = new Map<SectionKey, ProjectLinkRow[]>();
  for (const key of sectionOrder) {
    map.set(key, []);
  }
  for (const link of links) {
    const key: SectionKey =
      link.category_id == null || link.category_id === ''
        ? UNCATEGORIZED_KEY
        : link.category_id;
    const list = map.get(key);
    if (list) list.push(link);
    else map.set(key, [link]);
  }
  return map;
}

interface ContextLinksClientProps {
  projectId: string;
  initialLinks: ProjectLinkRow[];
  initialCategories?: LinkCategoryRow[];
  onRefresh?: () => void | Promise<void>;
  onCategoriesCacheUpdate?: (categories: LinkCategoryRow[]) => void;
}

function SortableSectionHeader({
  id,
  displayName,
  category,
  isCollapsed,
  onToggle,
  sectionLinksCount,
  activeLinksCount,
  onOpenAll,
  onEditCategory,
  onDeleteCategory,
  t,
}: {
  id: string;
  displayName: string;
  category: LinkCategoryRow | null;
  isCollapsed: boolean;
  onToggle: () => void;
  sectionLinksCount: number;
  activeLinksCount: number;
  onOpenAll: () => void;
  onEditCategory: (cat: LinkCategoryRow) => void;
  onDeleteCategory: (cat: LinkCategoryRow) => void;
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
            {displayName}
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
        {category && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="min-h-[44px] min-w-[44px] text-muted-foreground touch-manipulation"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  onEditCategory(category);
                }}
              >
                <Edit className="w-4 h-4 mr-2" />
                {t('links.edit_category')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  onDeleteCategory(category);
                }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {t('links.delete_category')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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

function getCategoryDisplayName(
  sectionKey: SectionKey,
  categories: LinkCategoryRow[],
  t: (key: string) => string
): string {
  if (sectionKey === UNCATEGORIZED_KEY) return t('links.uncategorized');
  const cat = categories.find((c) => c.id === sectionKey);
  return cat?.name ?? t('links.uncategorized');
}

export default function ContextLinksClient({
  projectId,
  initialLinks,
  initialCategories,
  onRefresh,
  onCategoriesCacheUpdate,
}: ContextLinksClientProps) {
  const { t } = useI18n();
  const [links, setLinks] = useState<ProjectLinkRow[]>(initialLinks);
  const [categories, setCategories] = useState<LinkCategoryRow[]>(
    initialCategories ?? []
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<ProjectLinkRow | null>(null);
  const [editingCategory, setEditingCategory] =
    useState<LinkCategoryRow | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [categoryToDelete, setCategoryToDelete] =
    useState<LinkCategoryRow | null>(null);
  const [isDeletingCategory, setIsDeletingCategory] = useState(false);

  const [sectionOrder, setSectionOrder] = useState<SectionKey[]>(() =>
    getSectionOrder(projectId, [])
  );
  const [collapsedSections, setCollapsedSections] = useState<Set<SectionKey>>(
    () => new Set()
  );
  const [categoriesLoaded, setCategoriesLoaded] = useState(
    initialCategories !== undefined
  );

  useEffect(() => {
    if (initialCategories !== undefined) return;
    listLinkCategoriesAction().then((data) => {
      setCategories(data);
      setCategoriesLoaded(true);
    });
  }, [initialCategories]);

  useEffect(() => {
    setLinks(initialLinks);
  }, [initialLinks]);

  useEffect(() => {
    if (initialCategories !== undefined) {
      setCategories(initialCategories);
    }
  }, [initialCategories]);

  useEffect(() => {
    if (categories.length === 0) return;
    const order = getSectionOrder(projectId, categories);
    setSectionOrder(order);
    setCollapsedSections(getCollapsedDefault(projectId, order));
  }, [projectId, categories]);

  const orderForRender = useMemo(() => {
    const keysFromLinks = new Set<SectionKey>();
    for (const link of links) {
      keysFromLinks.add(
        link.category_id == null || link.category_id === ''
          ? UNCATEGORIZED_KEY
          : link.category_id
      );
    }
    const missing = [...keysFromLinks].filter((k) => !sectionOrder.includes(k));
    return [...sectionOrder, ...missing];
  }, [sectionOrder, links]);

  const linksBySection = useMemo(
    () => groupLinksByCategory(links, orderForRender),
    [links, orderForRender]
  );

  const handleSuccess = useCallback(
    (payload?: {
      created?: ProjectLinkRow;
      updated?: ProjectLinkRow;
      categoryDeleted?: string;
    }) => {
      if (payload?.created) {
        setLinks((prev) => [...prev, payload.created!]);
      }
      if (payload?.updated) {
        setLinks((prev) =>
          prev.map((l) => (l.id === payload.updated!.id ? payload.updated! : l))
        );
      }
      if (payload?.categoryDeleted) {
        setLinks((prev) =>
          prev.filter((l) => l.category_id !== payload.categoryDeleted)
        );
        setCategories((prev) =>
          prev.filter((c) => c.id !== payload.categoryDeleted)
        );
      }
    },
    []
  );

  const handleEditCategory = useCallback((cat: LinkCategoryRow) => {
    setEditingCategory(cat);
    setEditingCategoryName(cat.name);
  }, []);

  const handleDeleteCategoryClick = useCallback((cat: LinkCategoryRow) => {
    setCategoryToDelete(cat);
  }, []);

  const handleConfirmDeleteCategory = useCallback(async () => {
    if (!categoryToDelete) return;
    setIsDeletingCategory(true);
    const { error } = await deleteLinkCategoryAction(categoryToDelete.id);
    setIsDeletingCategory(false);
    setCategoryToDelete(null);
    if (error) return;
    setLinks((prev) =>
      prev.filter((l) => l.category_id !== categoryToDelete.id)
    );
    const next = await listLinkCategoriesAction();
    setCategories(next);
    onCategoriesCacheUpdate?.(next);
  }, [categoryToDelete, onCategoriesCacheUpdate]);

  const handleSaveEditCategory = useCallback(async () => {
    if (!editingCategory) return;
    const name = editingCategoryName.trim();
    if (!name) return;
    const { error } = await updateLinkCategoryAction(editingCategory.id, name);
    if (error) return;
    const next = await listLinkCategoriesAction();
    setCategories(next);
    setEditingCategory(null);
    onCategoriesCacheUpdate?.(next);
  }, [editingCategory, editingCategoryName, onCategoriesCacheUpdate]);

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

  const handleArchive = useCallback(async (link: ProjectLinkRow) => {
    const result = await archiveProjectLinkAction(link.id);
    if (result.error) return;
    setLinks((prev) => prev.filter((l) => l.id !== link.id));
  }, []);

  const handleTogglePin = useCallback(async (link: ProjectLinkRow) => {
    const result = await updateProjectLinkAction(link.id, {
      pinned: !link.pinned,
    });
    if (result.error) return;
    if (result.data)
      setLinks((prev) =>
        prev.map((l) => (l.id === link.id ? result.data! : l))
      );
  }, []);

  const toggleSectionCollapsed = useCallback(
    (sectionKey: SectionKey) => {
      setCollapsedSections((prev) => {
        const next = new Set(prev);
        if (next.has(sectionKey)) next.delete(sectionKey);
        else next.add(sectionKey);
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
      const activeKey = activeId.replace('section:', '') as SectionKey;
      const overKey = overId.replace('section:', '') as SectionKey;
      const oldIndex = orderForRender.indexOf(activeKey);
      const newIndex = orderForRender.indexOf(overKey);
      if (oldIndex === -1 || newIndex === -1) return;
      const next = arrayMove(orderForRender, oldIndex, newIndex);
      setSectionOrder(next);
      saveSectionOrder(projectId, next);
    },
    [projectId, orderForRender]
  );

  const buildFullOrderedIds = useCallback(
    (sectionKey: SectionKey, reorderedLinkIds: string[]) => {
      const result: string[] = [];
      for (const sec of sectionOrder) {
        const sectionLinks = linksBySection.get(sec) ?? [];
        if (sec === sectionKey) {
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
    async (event: DragEndEvent, sectionKey: SectionKey) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const sectionLinks = linksBySection.get(sectionKey) ?? [];
      const ids = sectionLinks.map((l) => l.id);
      const oldIndex = ids.indexOf(active.id as string);
      const newIndex = ids.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;
      const reorderedIds = arrayMove(ids, oldIndex, newIndex);
      setLinks((prev) => {
        const bySection = groupLinksByCategory(prev, sectionOrder);
        const newSectionLinks = reorderedIds
          .map((id) => prev.find((l) => l.id === id))
          .filter((l): l is ProjectLinkRow => !!l);
        bySection.set(sectionKey, newSectionLinks);
        const out: ProjectLinkRow[] = [];
        for (const sec of sectionOrder) {
          out.push(...(bySection.get(sec) ?? []));
        }
        return out;
      });
      const fullOrdered = buildFullOrderedIds(sectionKey, reorderedIds);
      const { error } = await reorderProjectLinksAction(projectId, fullOrdered);
      if (error) onRefresh?.();
    },
    [projectId, sectionOrder, linksBySection, buildFullOrderedIds, onRefresh]
  );

  const showList = links.length > 0 && categoriesLoaded;

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
      ) : !showList ? (
        <SkeletonLinks />
      ) : (
        <DndContext
          sensors={sectionSensors}
          collisionDetection={closestCenter}
          onDragEnd={handleSectionDragEnd}
        >
          <SortableContext
            items={orderForRender.map((s) => `section:${s}`)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-6">
              {orderForRender.map((sectionKey) => {
                const sectionLinks = linksBySection.get(sectionKey) ?? [];
                if (sectionLinks.length === 0) return null;
                const isCollapsed = collapsedSections.has(sectionKey);
                const activeLinks = sectionLinks.filter((l) => !l.archived_at);
                const displayName = getCategoryDisplayName(
                  sectionKey,
                  categories,
                  t
                );

                const category =
                  sectionKey === UNCATEGORIZED_KEY
                    ? null
                    : (categories.find((c) => c.id === sectionKey) ?? null);

                return (
                  <section key={sectionKey}>
                    <SortableSectionHeader
                      id={`section:${sectionKey}`}
                      displayName={displayName}
                      category={category}
                      isCollapsed={isCollapsed}
                      onToggle={() => toggleSectionCollapsed(sectionKey)}
                      sectionLinksCount={sectionLinks.length}
                      activeLinksCount={activeLinks.length}
                      onOpenAll={() => handleOpenAllInSection(sectionLinks)}
                      onEditCategory={handleEditCategory}
                      onDeleteCategory={handleDeleteCategoryClick}
                      t={t}
                    />
                    {!isCollapsed && (
                      <DndContext
                        sensors={sectionSensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(e) => handleLinkDragEnd(e, sectionKey)}
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
        onCategoriesUpdated={(cats) => {
          setCategories(cats);
          onCategoriesCacheUpdate?.(cats);
        }}
      />

      <Dialog
        open={!!editingCategory}
        onOpenChange={(open) => !open && setEditingCategory(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('links.edit_category_title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="edit-category-name">
              {t('links.new_category_placeholder')}
            </Label>
            <Input
              id="edit-category-name"
              value={editingCategoryName}
              onChange={(e) => setEditingCategoryName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSaveEditCategory();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingCategory(null)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => handleSaveEditCategory()}
              disabled={!editingCategoryName.trim()}
            >
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!categoryToDelete}
        onOpenChange={(open) =>
          !open && !isDeletingCategory && setCategoryToDelete(null)
        }
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('links.delete_category_dialog_title')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            {t('links.delete_category_dialog_message')}
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCategoryToDelete(null)}
              disabled={isDeletingCategory}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDeleteCategory}
              disabled={isDeletingCategory}
            >
              {isDeletingCategory
                ? t('common.loading')
                : t('links.delete_category_confirm_button')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
