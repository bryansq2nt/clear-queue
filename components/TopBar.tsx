'use client';

import { Database } from '@/lib/supabase/types';
import { Input } from './ui/input';
import { Button } from './ui/button';
import Link from 'next/link';
import {
  Search,
  LogOut,
  CheckSquare,
  FileText,
  Menu,
  ArrowLeft,
} from 'lucide-react';
import { useState } from 'react';
import { AddProjectModal } from './AddProjectModal';
import { EditProjectModal } from './EditProjectModal';
import { useI18n } from '@/components/I18nProvider';
import { cn } from '@/lib/utils';

type Project = Database['public']['Tables']['projects']['Row'];

interface TopBarProps {
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onSignOut: () => void;
  onProjectAdded?: () => void;
  onProjectUpdated?: () => void;
  projectName: string;
  currentProject?: Project | null;
  selectionMode?: boolean;
  onToggleSelectionMode?: () => void;
  onOpenSidebar?: () => void;
  /** Detail view: back link + title only, no sidebar menu, no task search */
  backHref?: string;
  backLabel?: string;
  /** Optional actions (e.g. Edit, Delete) shown in header when in detail view */
  actions?: React.ReactNode;
  /** Minimal header: only menu + title, no Add Project / logout / search (e.g. for Clients list) */
  minimal?: boolean;
  /** When true, show sidebar menu button on all screen sizes (e.g. when sidebar is overlay-only) */
  showSidebarButtonAlways?: boolean;
  /** Controlled open state for Edit modal */
  editModalOpen?: boolean;
  onEditModalOpenChange?: (open: boolean) => void;
}

export default function TopBar({
  searchQuery = '',
  onSearchChange = () => {},
  onSignOut,
  onProjectAdded = () => {},
  onProjectUpdated = () => {},
  projectName,
  currentProject,
  selectionMode = false,
  onToggleSelectionMode,
  onOpenSidebar,
  backHref,
  backLabel,
  actions,
  minimal = false,
  showSidebarButtonAlways = false,
  editModalOpen: editModalOpenProp,
  onEditModalOpenChange,
}: TopBarProps) {
  const isDetailView = !!backHref;
  const { t } = useI18n();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpenInternal, setIsEditModalOpenInternal] = useState(false);
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);

  const isEditModalOpen = editModalOpenProp ?? isEditModalOpenInternal;
  const setEditModalOpen = (open: boolean) =>
    onEditModalOpenChange
      ? onEditModalOpenChange(open)
      : setIsEditModalOpenInternal(open);

  return (
    <>
      <div className="bg-primary text-primary-foreground shadow-xl flex-shrink-0">
        <div className="px-4 md:px-6 py-3 md:py-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {backHref && (
              <Link
                href={backHref}
                className="flex-shrink-0 inline-flex items-center gap-1.5 text-sm text-primary-foreground/90 hover:text-primary-foreground py-1 pr-2"
                aria-label={backLabel?.trim() ? undefined : t('common.back')}
              >
                <ArrowLeft className="w-4 h-4" />
                {backLabel?.trim() ? (
                  <span className="hidden sm:inline truncate max-w-[120px]">
                    {backLabel}
                  </span>
                ) : null}
              </Link>
            )}
            {onOpenSidebar && !backHref && (
              <button
                type="button"
                onClick={onOpenSidebar}
                className={cn(
                  'flex-shrink-0 p-2 rounded-lg hover:bg-primary-foreground/10 focus:outline-none focus:ring-2 focus:ring-primary-foreground/50',
                  !showSidebarButtonAlways && 'md:hidden'
                )}
                aria-label={t('sidebar.navigation')}
              >
                <Menu className="w-5 h-5" />
              </button>
            )}
            <h1 className="text-base md:text-xl font-bold truncate min-w-0 flex-1">
              {backHref || minimal
                ? projectName
                : `${projectName} – ${t('topbar.task_board')}`}
            </h1>
            {isDetailView && actions != null && (
              <div className="flex items-center gap-2 flex-shrink-0">
                {actions}
              </div>
            )}
          </div>
          {!minimal && (
            <>
              <div
                className={cn(
                  'flex items-center gap-2 flex-wrap',
                  isDetailView && 'hidden lg:flex'
                )}
              >
                {onToggleSelectionMode && !isDetailView && (
                  <Button
                    onClick={onToggleSelectionMode}
                    variant={selectionMode ? 'default' : 'outline'}
                    size="sm"
                    className={
                      selectionMode
                        ? 'bg-primary-foreground text-primary hover:bg-primary-foreground/90'
                        : 'bg-primary/80 text-primary-foreground border-primary-foreground/30 hover:bg-primary/90'
                    }
                  >
                    <CheckSquare className="w-4 h-4 md:mr-2" />
                    <span className="hidden md:inline">
                      {selectionMode
                        ? t('topbar.cancel_selection')
                        : t('topbar.select')}
                    </span>
                  </Button>
                )}
                {currentProject ? (
                  <>
                    {!isDetailView && (
                      <Button
                        onClick={() => setIsNotesModalOpen(true)}
                        variant="outline"
                        size="sm"
                        className="bg-primary/80 text-primary-foreground border-primary-foreground/30 hover:bg-primary/90"
                      >
                        <FileText className="w-4 h-4 md:mr-2" />
                        {t('sidebar.notes')}
                      </Button>
                    )}
                    {!isDetailView && (
                      <Button
                        onClick={() => setEditModalOpen(true)}
                        variant="default"
                        size="sm"
                        className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
                      >
                        {t('topbar.edit_project')}
                      </Button>
                    )}
                  </>
                ) : !isDetailView ? (
                  <Button
                    onClick={() => setIsAddModalOpen(true)}
                    variant="default"
                    size="sm"
                    className="bg-white text-slate-900 hover:bg-slate-100"
                  >
                    {t('topbar.add_project')}
                  </Button>
                ) : null}
                {!isDetailView && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onSignOut()}
                    className="text-primary-foreground hover:bg-primary/80"
                    aria-label="Sign out"
                  >
                    <LogOut className="w-4 h-4" />
                  </Button>
                )}
              </div>
              {!isDetailView && (
                <div className="relative min-w-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-foreground/70" />
                  <Input
                    placeholder={t('topbar.search_tasks')}
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="pl-10 bg-primary/80 border-primary-foreground/20 text-primary-foreground placeholder:text-primary-foreground/60 w-full max-w-md"
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {currentProject ? (
        <>
          <EditProjectModal
            isOpen={isEditModalOpen}
            onClose={() => setEditModalOpen(false)}
            onProjectUpdated={() => {
              onProjectUpdated();
              setEditModalOpen(false);
            }}
            project={currentProject}
            defaultTab="details"
          />
          <EditProjectModal
            isOpen={isNotesModalOpen}
            onClose={() => setIsNotesModalOpen(false)}
            onProjectUpdated={() => {
              onProjectUpdated();
            }}
            project={currentProject}
            defaultTab="notes"
          />
        </>
      ) : (
        <AddProjectModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onProjectAdded={onProjectAdded}
        />
      )}
    </>
  );
}
