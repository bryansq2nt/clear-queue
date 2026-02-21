'use client';

import { useState, useEffect, useCallback } from 'react';
import { Database } from '@/lib/supabase/types';
import { cn } from '@/lib/utils';
import { useRouter, usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  MoreVertical,
  Edit,
  Archive,
  ArchiveRestore,
  Trash2,
  Plus,
  Lightbulb,
  DollarSign,
  CheckSquare,
  Star,
  Users,
  Building2,
  FileText,
  Receipt,
  Settings,
  User,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  FolderKanban,
} from 'lucide-react';
import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { EditProjectModal } from './EditProjectModal';
import { AddProjectModal } from './AddProjectModal';
import {
  archiveProject,
  unarchiveProject,
  deleteProject,
  getFavoriteProjectIds,
  addProjectFavorite,
  removeProjectFavorite,
} from '@/app/actions/projects';
import { signOut } from '@/app/actions/auth';
import { useI18n } from '@/components/I18nProvider';

type Project = Database['public']['Tables']['projects']['Row'];

interface SidebarProps {
  projects: Project[];
  selectedProject: string | null;
  selectedCategory: string | null;
  showArchived: boolean;
  onSelectProject: (projectId: string | null) => void;
  onCategoryChange: (category: string | null) => void;
  onShowArchivedChange: (show: boolean) => void;
  onProjectUpdated: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  /** When true, sidebar is overlay/drawer on all screen sizes (no layout column) */
  overlayOnly?: boolean;
}

const SIDEBAR_MOBILE_BREAKPOINT = 768;

export default function Sidebar({
  projects,
  selectedProject,
  selectedCategory,
  showArchived,
  onSelectProject,
  onCategoryChange,
  onShowArchivedChange,
  onProjectUpdated,
  mobileOpen = true,
  onMobileClose,
  overlayOnly = false,
}: SidebarProps) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isAddProjectModalOpen, setIsAddProjectModalOpen] = useState(false);
  const [favoriteProjectIds, setFavoriteProjectIds] = useState<Set<string>>(
    new Set()
  );
  const [isMobile, setIsMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const SIDEBAR_STORAGE_KEY = 'sidebar-collapsed';

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (stored === 'true') setCollapsed(true);
    } catch (_) {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
    } catch (_) {}
  }, [collapsed]);
  const toggleCollapsed = () => setCollapsed((c) => !c);

  useEffect(() => {
    const mq = window.matchMedia(
      `(max-width: ${SIDEBAR_MOBILE_BREAKPOINT - 1}px)`
    );
    const handler = () => setIsMobile(mq.matches);
    setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const handler = () => setIsAddProjectModalOpen(true);
    window.addEventListener('sidebar-open-add-project', handler);
    return () =>
      window.removeEventListener('sidebar-open-add-project', handler);
  }, []);

  const isDrawerMode =
    (isMobile && onMobileClose != null) ||
    (overlayOnly && onMobileClose != null);
  const isDrawerOpen = isDrawerMode ? mobileOpen : true;
  const canCollapse = !isMobile && !overlayOnly;
  const isCollapsed = canCollapse && collapsed;

  const loadFavorites = useCallback(async () => {
    const res = await getFavoriteProjectIds();
    setFavoriteProjectIds(new Set(res.ok ? res.data : []));
  }, []);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  async function handleToggleFavorite(projectId: string, isFavorite: boolean) {
    if (isFavorite) {
      const res = await removeProjectFavorite(projectId);
      if (res.ok)
        setFavoriteProjectIds((prev) => {
          const n = new Set(prev);
          n.delete(projectId);
          return n;
        });
    } else {
      const res = await addProjectFavorite(projectId);
      if (res.ok) setFavoriteProjectIds((prev) => new Set(prev).add(projectId));
    }
    onProjectUpdated();
  }

  const favoriteProjects = projects.filter((p) => favoriteProjectIds.has(p.id));

  async function handleArchive(project: Project) {
    if (project.category === 'archived') {
      await unarchiveProject(project.id);
    } else {
      await archiveProject(project.id);
    }
    onProjectUpdated();
  }

  async function handleDelete(project: Project) {
    if (!confirm(t('projects.delete_confirm', { name: project.name }))) {
      return;
    }
    setIsDeleting(project.id);
    await deleteProject(project.id);
    setIsDeleting(null);
    onProjectUpdated();
    if (selectedProject === project.id) {
      router.push('/dashboard');
    }
  }

  return (
    <>
      {isDrawerMode && isDrawerOpen && (
        <div
          className={cn(
            'fixed inset-0 bg-black/50 z-40',
            !overlayOnly && 'md:hidden'
          )}
          aria-hidden
          onClick={onMobileClose}
        />
      )}
      <div
        className={cn(
          'bg-card border-r border-border flex flex-col overflow-hidden shadow-lg transition-[width] duration-200 ease-out flex-shrink-0 h-full',
          isDrawerMode
            ? 'fixed inset-y-0 left-0 z-50 w-64 max-h-full'
            : 'relative',
          !isDrawerMode && (isCollapsed ? 'w-16' : 'w-64'),
          isDrawerMode && (isDrawerOpen ? 'translate-x-0' : '-translate-x-full')
        )}
      >
        <div
          className={cn(
            'flex flex-col min-h-0 flex-1 h-full',
            isCollapsed ? 'p-2 space-y-2' : 'p-4 space-y-6'
          )}
        >
          {isDrawerMode && isDrawerOpen && onMobileClose && (
            <div className="flex items-center justify-end -mt-1 -mr-1 mb-2 flex-shrink-0">
              <button
                type="button"
                onClick={onMobileClose}
                className="p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                aria-label={t('sidebar.navigation')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
            <div>
              {!isCollapsed && (
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
                  {t('sidebar.navigation')}
                </label>
              )}
              <div
                className={cn(
                  'space-y-1',
                  isCollapsed && 'flex flex-col items-center'
                )}
              >
                <Link
                  href="/dashboard"
                  className={cn(
                    'w-full flex items-center rounded-md text-sm transition-colors',
                    isCollapsed ? 'justify-center p-2' : 'gap-2 px-3 py-2',
                    pathname === '/dashboard'
                      ? 'bg-accent text-foreground font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                  title={isCollapsed ? t('sidebar.dashboard') : undefined}
                >
                  <LayoutDashboard className="w-4 h-4 flex-shrink-0" />
                  {!isCollapsed && t('sidebar.dashboard')}
                </Link>
                <Link
                  href="/projects"
                  className={cn(
                    'w-full flex items-center rounded-md text-sm transition-colors',
                    isCollapsed ? 'justify-center p-2' : 'gap-2 px-3 py-2',
                    pathname?.startsWith('/projects')
                      ? 'bg-accent text-foreground font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                  title={isCollapsed ? t('sidebar.my_projects') : undefined}
                >
                  <FolderKanban className="w-4 h-4 flex-shrink-0" />
                  {!isCollapsed && t('sidebar.my_projects')}
                </Link>
                <Link
                  href="/ideas"
                  className={cn(
                    'w-full flex items-center rounded-md text-sm transition-colors',
                    isCollapsed ? 'justify-center p-2' : 'gap-2 px-3 py-2',
                    pathname?.startsWith('/ideas')
                      ? 'bg-accent text-foreground font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                  title={isCollapsed ? t('sidebar.idea_graph') : undefined}
                >
                  <Lightbulb className="w-4 h-4 flex-shrink-0" />
                  {!isCollapsed && t('sidebar.idea_graph')}
                </Link>
                <Link
                  href="/todo"
                  className={cn(
                    'w-full flex items-center rounded-md text-sm transition-colors',
                    isCollapsed ? 'justify-center p-2' : 'gap-2 px-3 py-2',
                    pathname?.startsWith('/todo')
                      ? 'bg-accent text-foreground font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                  title={isCollapsed ? t('sidebar.todo_list') : undefined}
                >
                  <CheckSquare className="w-4 h-4 flex-shrink-0" />
                  {!isCollapsed && t('sidebar.todo_list')}
                </Link>
                <Link
                  href="/budgets"
                  className={cn(
                    'w-full flex items-center rounded-md text-sm transition-colors',
                    isCollapsed ? 'justify-center p-2' : 'gap-2 px-3 py-2',
                    pathname?.startsWith('/budgets')
                      ? 'bg-accent text-foreground font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                  title={isCollapsed ? t('sidebar.budgets') : undefined}
                >
                  <DollarSign className="w-4 h-4 flex-shrink-0" />
                  {!isCollapsed && t('sidebar.budgets')}
                </Link>
                <Link
                  href="/clients"
                  className={cn(
                    'w-full flex items-center rounded-md text-sm transition-colors',
                    isCollapsed ? 'justify-center p-2' : 'gap-2 px-3 py-2',
                    pathname?.startsWith('/clients')
                      ? 'bg-accent text-foreground font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                  title={isCollapsed ? t('sidebar.clients') : undefined}
                >
                  <Users className="w-4 h-4 flex-shrink-0" />
                  {!isCollapsed && t('sidebar.clients')}
                </Link>
                <Link
                  href="/businesses"
                  className={cn(
                    'w-full flex items-center rounded-md text-sm transition-colors',
                    isCollapsed ? 'justify-center p-2' : 'gap-2 px-3 py-2',
                    pathname?.startsWith('/businesses')
                      ? 'bg-accent text-foreground font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                  title={isCollapsed ? t('sidebar.businesses') : undefined}
                >
                  <Building2 className="w-4 h-4 flex-shrink-0" />
                  {!isCollapsed && t('sidebar.businesses')}
                </Link>
                <Link
                  href="/billings"
                  className={cn(
                    'w-full flex items-center rounded-md text-sm transition-colors',
                    isCollapsed ? 'justify-center p-2' : 'gap-2 px-3 py-2',
                    pathname?.startsWith('/billings')
                      ? 'bg-accent text-foreground font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                  title={isCollapsed ? 'Billings' : undefined}
                >
                  <Receipt className="w-4 h-4 flex-shrink-0" />
                  {!isCollapsed && 'Billings'}
                </Link>
                <Link
                  href="/notes"
                  className={cn(
                    'w-full flex items-center rounded-md text-sm transition-colors',
                    isCollapsed ? 'justify-center p-2' : 'gap-2 px-3 py-2',
                    pathname?.startsWith('/notes')
                      ? 'bg-accent text-foreground font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                  title={isCollapsed ? t('sidebar.notes') : undefined}
                >
                  <FileText className="w-4 h-4 flex-shrink-0" />
                  {!isCollapsed && t('sidebar.notes')}
                </Link>
                <Link
                  href="/profile"
                  className={cn(
                    'w-full flex items-center rounded-md text-sm transition-colors',
                    isCollapsed ? 'justify-center p-2' : 'gap-2 px-3 py-2',
                    pathname === '/profile'
                      ? 'bg-accent text-foreground font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                  title={isCollapsed ? t('sidebar.profile') : undefined}
                >
                  <User className="w-4 h-4 flex-shrink-0" />
                  {!isCollapsed && t('sidebar.profile')}
                </Link>
                <Link
                  href="/settings/appearance"
                  className={cn(
                    'w-full flex items-center rounded-md text-sm transition-colors',
                    isCollapsed ? 'justify-center p-2' : 'gap-2 px-3 py-2',
                    pathname?.startsWith('/settings')
                      ? 'bg-accent text-foreground font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                  title={isCollapsed ? t('sidebar.settings') : undefined}
                >
                  <Settings className="w-4 h-4 flex-shrink-0" />
                  {!isCollapsed && t('sidebar.settings')}
                </Link>
                <button
                  onClick={() => setIsAddProjectModalOpen(true)}
                  className={cn(
                    'w-full flex items-center rounded-md text-sm transition-colors text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    isCollapsed ? 'justify-center p-2' : 'gap-2 px-3 py-2'
                  )}
                  title={isCollapsed ? t('sidebar.add_project') : undefined}
                >
                  <Plus className="w-4 h-4 flex-shrink-0" />
                  {!isCollapsed && t('sidebar.add_project')}
                </button>
              </div>
            </div>

            {/* Favorite Projects - hidden when collapsed */}
            {favoriteProjects.length > 0 && !isCollapsed && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
                  {t('sidebar.favorites')}
                </label>
                <div className="space-y-1">
                  {favoriteProjects.map((project) => (
                    <div
                      key={project.id}
                      className={cn(
                        'group flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                        selectedProject === project.id ||
                          pathname === `/context/${project.id}/board`
                          ? 'bg-accent text-foreground font-medium'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      )}
                    >
                      <button
                        onClick={() => {
                          onSelectProject(project.id);
                          router.push(`/context/${project.id}/board`);
                        }}
                        className="flex items-center gap-2 flex-1 text-left min-w-0"
                      >
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: project.color || '#94a3b8',
                          }}
                        />
                        <span className="truncate flex-1 min-w-0">
                          {project.name}
                        </span>
                        {project.category === 'archived' && (
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {t('dashboard.archived')}
                          </span>
                        )}
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          asChild
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className="opacity-60 group-hover:opacity-100 p-1 hover:bg-slate-200 rounded transition-opacity flex-shrink-0"
                            onClick={(e) => e.stopPropagation()}
                            title={t('sidebar.project_options')}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() =>
                              handleToggleFavorite(project.id, true)
                            }
                          >
                            <Star className="w-4 h-4 mr-2 fill-amber-400 text-amber-500" />
                            {t('sidebar.remove_from_favorites')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setEditingProject(project)}
                          >
                            <Edit className="w-4 h-4 mr-2" />
                            {t('sidebar.edit_project')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {project.category === 'archived' ? (
                            <DropdownMenuItem
                              onClick={() => handleArchive(project)}
                            >
                              <ArchiveRestore className="w-4 h-4 mr-2" />
                              {t('sidebar.unarchive')}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => handleArchive(project)}
                            >
                              <Archive className="w-4 h-4 mr-2" />
                              {t('sidebar.archive')}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDelete(project)}
                            className="text-red-600 focus:text-red-600"
                            disabled={isDeleting === project.id}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            {isDeleting === project.id
                              ? t('projects.deleting')
                              : t('common.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-auto pt-4 border-t border-border flex-shrink-0 space-y-0.5">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                signOut();
              }}
              className={cn(
                'w-full flex items-center rounded-md text-sm transition-colors text-muted-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer',
                isCollapsed ? 'justify-center p-2' : 'gap-2 px-3 py-2'
              )}
              aria-label={t('sidebar.logout')}
              title={isCollapsed ? t('sidebar.logout') : undefined}
            >
              <LogOut className="w-4 h-4 flex-shrink-0" />
              {!isCollapsed && t('sidebar.logout')}
            </button>
            {canCollapse && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleCollapsed();
                }}
                className={cn(
                  'w-full flex items-center rounded-md text-sm transition-colors text-muted-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer',
                  isCollapsed ? 'justify-center p-2' : 'gap-2 px-3 py-2'
                )}
                aria-label={
                  isCollapsed ? t('sidebar.expand') : t('sidebar.collapse')
                }
                title={
                  isCollapsed ? t('sidebar.expand') : t('sidebar.collapse')
                }
              >
                {isCollapsed ? (
                  <PanelLeftOpen className="w-4 h-4 flex-shrink-0" />
                ) : (
                  <>
                    <PanelLeftClose className="w-4 h-4 flex-shrink-0" />
                    {t('sidebar.collapse')}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
      {editingProject && (
        <EditProjectModal
          isOpen={!!editingProject}
          onClose={() => setEditingProject(null)}
          onProjectUpdated={() => {
            onProjectUpdated();
            setEditingProject(null);
          }}
          project={editingProject}
        />
      )}
      <AddProjectModal
        isOpen={isAddProjectModalOpen}
        onClose={() => setIsAddProjectModalOpen(false)}
        onProjectAdded={() => {
          onProjectUpdated();
          setIsAddProjectModalOpen(false);
        }}
      />
    </>
  );
}
