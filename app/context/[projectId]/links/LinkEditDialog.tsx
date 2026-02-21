'use client';

import { useState, useTransition, useEffect } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { Database } from '@/lib/supabase/types';
import { LINK_TYPES, SECTIONS } from '@/lib/validation/project-links';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createProjectLinkAction, updateProjectLinkAction } from './actions';
import { normalizeTags } from '@/lib/validation/project-links';

type ProjectLinkRow = Database['public']['Tables']['project_links']['Row'];
type Section = Database['public']['Enums']['project_link_section_enum'];
type LinkType = Database['public']['Enums']['project_link_type_enum'];

interface LinkEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  mode: 'create' | 'edit';
  link?: ProjectLinkRow | null;
  onSuccess: () => void;
}

const SECTION_ORDER: Section[] = [...SECTIONS];
const LINK_TYPE_ORDER: LinkType[] = [...LINK_TYPES];

export default function LinkEditDialog({
  open,
  onOpenChange,
  projectId,
  mode,
  link,
  onSuccess,
}: LinkEditDialogProps) {
  const { t } = useI18n();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(link?.title ?? '');
  const [url, setUrl] = useState(link?.url ?? '');
  const [description, setDescription] = useState(link?.description ?? '');
  const [provider, setProvider] = useState(link?.provider ?? '');
  const [section, setSection] = useState<Section>(link?.section ?? 'other');
  const [linkType, setLinkType] = useState<LinkType>(
    link?.link_type ?? 'resource'
  );
  const [tagsStr, setTagsStr] = useState(
    link?.tags?.length ? link.tags.join(', ') : ''
  );
  const [pinned, setPinned] = useState(link?.pinned ?? false);
  const [openInNewTab, setOpenInNewTab] = useState(
    link?.open_in_new_tab ?? true
  );

  useEffect(() => {
    if (open) {
      setTitle(link?.title ?? '');
      setUrl(link?.url ?? '');
      setDescription(link?.description ?? '');
      setProvider(link?.provider ?? '');
      setSection(link?.section ?? 'other');
      setLinkType(link?.link_type ?? 'resource');
      setTagsStr(link?.tags?.length ? link.tags.join(', ') : '');
      setPinned(link?.pinned ?? false);
      setOpenInNewTab(link?.open_in_new_tab ?? true);
      setError(null);
    }
  }, [open, link]);

  const resetForm = () => {
    setTitle(link?.title ?? '');
    setUrl(link?.url ?? '');
    setDescription(link?.description ?? '');
    setProvider(link?.provider ?? '');
    setSection(link?.section ?? 'other');
    setLinkType(link?.link_type ?? 'resource');
    setTagsStr(link?.tags?.length ? link.tags.join(', ') : '');
    setPinned(link?.pinned ?? false);
    setOpenInNewTab(link?.open_in_new_tab ?? true);
    setError(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
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
        const result = await createProjectLinkAction(projectId, {
          title: title.trim(),
          url: url.trim(),
          description: description.trim() || null,
          provider: provider.trim() || null,
          section,
          link_type: linkType,
          tags,
          pinned,
          open_in_new_tab: openInNewTab,
        });
        if (result.error) {
          setError(result.error);
          return;
        }
        handleOpenChange(false);
        onSuccess();
      } else if (link) {
        const result = await updateProjectLinkAction(link.id, {
          title: title.trim(),
          url: url.trim(),
          description: description.trim() || null,
          provider: provider.trim() || null,
          section,
          link_type: linkType,
          tags,
          pinned,
          open_in_new_tab: openInNewTab,
        });
        if (result.error) {
          setError(result.error);
          return;
        }
        handleOpenChange(false);
        onSuccess();
      }
    });
  };

  return (
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
            <Label htmlFor="link-title">{t('links.title_placeholder')} *</Label>
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
            <Label htmlFor="link-description">
              {t('links.description_placeholder')}
            </Label>
            <Textarea
              id="link-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('links.description_placeholder')}
              rows={2}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="link-provider">
              {t('links.provider_placeholder')}
            </Label>
            <Input
              id="link-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder={t('links.provider_placeholder')}
              disabled={isPending}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('links.section_label')}</Label>
              <Select
                value={section}
                onValueChange={(v) => setSection(v as Section)}
                disabled={isPending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SECTION_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`links.section_${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('links.type_label')}</Label>
              <Select
                value={linkType}
                onValueChange={(v) => setLinkType(v as LinkType)}
                disabled={isPending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LINK_TYPE_ORDER.map((ty) => (
                    <SelectItem key={ty} value={ty}>
                      {t(`links.type_${ty}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
                disabled={isPending}
                className="rounded border-input"
              />
              <span className="text-sm">{t('links.pinned')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={openInNewTab}
                onChange={(e) => setOpenInNewTab(e.target.checked)}
                disabled={isPending}
                className="rounded border-input"
              />
              <span className="text-sm">{t('links.open_in_new_tab')}</span>
            </label>
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
  );
}
