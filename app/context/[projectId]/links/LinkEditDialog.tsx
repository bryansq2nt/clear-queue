'use client';

import { useState, useTransition, useEffect, useCallback } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { Database } from '@/lib/supabase/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  createProjectLinkAction,
  updateProjectLinkAction,
  listLinkCategoriesAction,
  createLinkCategoryAction,
  updateLinkCategoryAction,
  deleteLinkCategoryAction,
} from './actions';
import { normalizeTags } from '@/lib/validation/project-links';
import { Settings2, Pencil, Trash2, Plus } from 'lucide-react';

type ProjectLinkRow = Database['public']['Tables']['project_links']['Row'];
type LinkCategoryRow = Database['public']['Tables']['link_categories']['Row'];

interface LinkEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  mode: 'create' | 'edit';
  link?: ProjectLinkRow | null;
  onSuccess: (payload?: {
    created?: ProjectLinkRow;
    updated?: ProjectLinkRow;
    categoryDeleted?: string;
  }) => void;
  onCategoriesUpdated?: (categories: LinkCategoryRow[]) => void;
}

export default function LinkEditDialog({
  open,
  onOpenChange,
  projectId,
  mode,
  link,
  onSuccess,
  onCategoriesUpdated,
}: LinkEditDialogProps) {
  const { t } = useI18n();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [categories, setCategories] = useState<LinkCategoryRow[]>([]);
  const [showManageCategories, setShowManageCategories] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null
  );
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [categoryToDelete, setCategoryToDelete] =
    useState<LinkCategoryRow | null>(null);
  const [isDeletingCategory, setIsDeletingCategory] = useState(false);

  const [title, setTitle] = useState(link?.title ?? '');
  const [url, setUrl] = useState(link?.url ?? '');
  const [categoryId, setCategoryId] = useState<string>(link?.category_id ?? '');
  const [tagsStr, setTagsStr] = useState(
    link?.tags?.length ? link.tags.join(', ') : ''
  );

  const loadCategories = useCallback(async () => {
    const data = await listLinkCategoriesAction();
    setCategories(data);
    if (data.length > 0) setCategoryId((prev) => (prev ? prev : data[0].id));
  }, []);

  useEffect(() => {
    if (open) {
      loadCategories();
      setTitle(link?.title ?? '');
      setUrl(link?.url ?? '');
      setCategoryId(link?.category_id ?? '');
      setTagsStr(link?.tags?.length ? link.tags.join(', ') : '');
      setError(null);
      setShowManageCategories(false);
      setEditingCategoryId(null);
      setNewCategoryName('');
    }
  }, [open, link, loadCategories]);

  useEffect(() => {
    if (open && categories.length > 0 && !categoryId) {
      setCategoryId(categories[0].id);
    }
  }, [open, categories, categoryId]);

  const resetForm = () => {
    setTitle(link?.title ?? '');
    setUrl(link?.url ?? '');
    setCategoryId(link?.category_id ?? '');
    setTagsStr(link?.tags?.length ? link.tags.join(', ') : '');
    setError(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    const result = await createLinkCategoryAction(name);
    if (result.error) {
      setError(result.error);
      return;
    }
    setNewCategoryName('');
    if (result.data) {
      setCategories((prev) => [...prev, result.data!]);
      setCategoryId(result.data.id);
    }
    setShowManageCategories(false);
    const data = await listLinkCategoriesAction();
    setCategories(data);
    onCategoriesUpdated?.(data);
  };

  const handleStartEditCategory = (cat: LinkCategoryRow) => {
    setEditingCategoryId(cat.id);
    setEditingCategoryName(cat.name);
  };

  const handleSaveEditCategory = async () => {
    if (!editingCategoryId) return;
    const name = editingCategoryName.trim();
    if (!name) return;
    const result = await updateLinkCategoryAction(editingCategoryId, name);
    if (result.error) {
      setError(result.error);
      return;
    }
    setEditingCategoryId(null);
    const next = await listLinkCategoriesAction();
    setCategories(next);
    onCategoriesUpdated?.(next);
  };

  const handleDeleteCategoryClick = (cat: LinkCategoryRow) => {
    setCategoryToDelete(cat);
  };

  const handleConfirmDeleteCategory = async () => {
    if (!categoryToDelete) return;
    setIsDeletingCategory(true);
    const result = await deleteLinkCategoryAction(categoryToDelete.id);
    setIsDeletingCategory(false);
    setCategoryToDelete(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (categoryId === categoryToDelete.id)
      setCategoryId(
        categories.find((c) => c.id !== categoryToDelete.id)?.id ?? ''
      );
    const next = await listLinkCategoriesAction();
    setCategories(next);
    onCategoriesUpdated?.(next);
    onSuccess({ categoryDeleted: categoryToDelete.id });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const tags = normalizeTags(
      tagsStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );

    startTransition(async () => {
      if (mode === 'create') {
        if (!categoryId) {
          setError(t('links.error_category_required'));
          return;
        }
        const result = await createProjectLinkAction(projectId, {
          title: title.trim(),
          url: url.trim(),
          description: null,
          provider: null,
          category_id: categoryId,
          link_type: 'resource',
          tags,
          pinned: false,
          open_in_new_tab: true,
        });
        if (result.error) {
          setError(result.error);
          return;
        }
        handleOpenChange(false);
        onSuccess(result.data ? { created: result.data } : undefined);
      } else if (link) {
        const result = await updateProjectLinkAction(link.id, {
          title: title.trim(),
          url: url.trim(),
          category_id: categoryId || null,
          tags,
        });
        if (result.error) {
          setError(result.error);
          return;
        }
        handleOpenChange(false);
        onSuccess(result.data ? { updated: result.data } : undefined);
      }
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {mode === 'create' ? t('links.add_link') : t('links.edit_link')}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="link-title">
                {t('links.title_placeholder')} *
              </Label>
              <Input
                id="link-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('links.title_placeholder')}
                required
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="link-url">URL *</Label>
              <Input
                id="link-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t('links.url_placeholder')}
                required
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>{t('links.category_label')}</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground h-8 px-2"
                  onClick={() => setShowManageCategories((v) => !v)}
                >
                  <Settings2 className="w-4 h-4 mr-1" />
                  {showManageCategories
                    ? t('links.hide_manage')
                    : t('links.manage_categories')}
                </Button>
              </div>
              <Select
                value={categoryId}
                onValueChange={setCategoryId}
                disabled={isPending}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('links.select_category')} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {showManageCategories && (
                <div className="rounded-lg border border-border p-3 space-y-3 bg-muted/30">
                  <div className="flex gap-2">
                    <Input
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCategory();
                        }
                      }}
                      placeholder={t('links.new_category_placeholder')}
                      disabled={isPending}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={handleAddCategory}
                      disabled={isPending || !newCategoryName.trim()}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  <ul className="space-y-2 max-h-32 overflow-y-auto">
                    {categories.map((cat) => (
                      <li
                        key={cat.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        {editingCategoryId === cat.id ? (
                          <>
                            <Input
                              value={editingCategoryName}
                              onChange={(e) =>
                                setEditingCategoryName(e.target.value)
                              }
                              className="h-8 flex-1"
                              autoFocus
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              onClick={() => handleSaveEditCategory()}
                            >
                              {t('common.save')}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              onClick={() => setEditingCategoryId(null)}
                            >
                              {t('common.cancel')}
                            </Button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 truncate">{cat.name}</span>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-muted-foreground"
                              onClick={() => handleStartEditCategory(cat)}
                              aria-label={t('common.edit')}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-destructive"
                              onClick={() => handleDeleteCategoryClick(cat)}
                              aria-label={t('common.delete')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="link-tags">Tags (comma-separated)</Label>
              <Input
                id="link-tags"
                value={tagsStr}
                onChange={(e) => setTagsStr(e.target.value)}
                placeholder="figma, design, reference"
                disabled={isPending}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isPending}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? mode === 'create'
                    ? t('links.creating')
                    : t('links.updating')
                  : t('links.save')}
              </Button>
            </DialogFooter>
          </form>
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
    </>
  );
}
