'use client';

import Link from 'next/link';
import { useI18n } from '@/components/I18nProvider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import {
  FileText,
  Lightbulb,
  CheckSquare,
  Receipt,
  ChevronDown,
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import {
  getProjectResources,
  type ProjectResources,
} from '@/app/projects/actions';
import { cn } from '@/lib/utils';

interface ProjectResourcesModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName?: string;
}

export function ProjectResourcesModal({
  isOpen,
  onClose,
  projectId,
  projectName,
}: ProjectResourcesModalProps) {
  const { t } = useI18n();
  const [data, setData] = useState<ProjectResources | null>(null);
  const [loading, setLoading] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId || !isOpen) return;
    setLoading(true);
    try {
      const res = await getProjectResources(projectId);
      setData(res);
    } finally {
      setLoading(false);
    }
  }, [projectId, isOpen]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (key: string) => {
    setOpenSection((prev) => (prev === key ? null : key));
  };

  const sections = [
    {
      key: 'budgets',
      label: t('sidebar.budgets'),
      icon: Receipt,
      items: data?.budgets ?? [],
      emptyLabel: t('resources.no_budgets'),
      getHref: (id: string) => `/budgets/${id}`,
      getLabel: (item: { id: string; name: string }) => item.name,
      ariaOpen: t('resources.open_budget'),
    },
    {
      key: 'notes',
      label: t('sidebar.notes'),
      icon: FileText,
      items: data?.notes ?? [],
      emptyLabel: t('resources.no_notes'),
      getHref: (id: string) => `/notes/${id}`,
      getLabel: (item: { id: string; title: string }) => item.title,
      ariaOpen: t('resources.open_note'),
    },
    {
      key: 'boards',
      label: t('sidebar.idea_graph'),
      icon: Lightbulb,
      items: data?.boards ?? [],
      emptyLabel: t('resources.no_ideas'),
      getHref: (id: string) => `/ideas/boards/${id}`,
      getLabel: (item: { id: string; name: string }) => item.name,
      ariaOpen: t('resources.open_board'),
    },
    {
      key: 'todoLists',
      label: t('sidebar.todo_list'),
      icon: CheckSquare,
      items: data?.todoLists ?? [],
      emptyLabel: t('resources.no_todo_lists'),
      getHref: (id: string) => `/todo/list/${id}`,
      getLabel: (item: { id: string; title: string }) => item.title,
      ariaOpen: t('resources.open_list'),
    },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('resources.title')}</DialogTitle>
          <DialogDescription>
            {projectName
              ? t('resources.subtitle_project', { name: projectName })
              : t('resources.subtitle')}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {t('common.loading')}
          </div>
        ) : (
          <div className="space-y-1">
            {sections.map(
              ({
                key,
                label,
                icon: Icon,
                items,
                emptyLabel,
                getHref,
                getLabel,
                ariaOpen,
              }) => (
                <div
                  key={key}
                  className="rounded-lg border border-border overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggle(key)}
                    className="w-full flex items-center justify-between gap-3 p-3 bg-card hover:bg-accent transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <span className="font-medium text-foreground">
                        {label}
                      </span>
                      {items.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          ({items.length})
                        </span>
                      )}
                    </div>
                    <ChevronDown
                      className={cn(
                        'w-5 h-5 flex-shrink-0 text-muted-foreground transition-transform',
                        openSection === key && 'rotate-180'
                      )}
                    />
                  </button>
                  {openSection === key && (
                    <div className="border-t border-border bg-muted/30 max-h-48 overflow-y-auto">
                      {items.length === 0 ? (
                        <p className="p-3 text-sm text-muted-foreground">
                          {emptyLabel}
                        </p>
                      ) : (
                        <ul className="py-1">
                          {items.map((item) => (
                            <li key={item.id}>
                              <Link
                                href={getHref(item.id)}
                                onClick={onClose}
                                className="block px-3 py-2.5 text-sm text-foreground hover:bg-accent truncate"
                                title={ariaOpen}
                              >
                                {getLabel(item as any)}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
