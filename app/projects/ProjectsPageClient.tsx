'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { type Database } from '@/lib/supabase/types';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import { useI18n } from '@/components/I18nProvider';
import { signOut } from '@/app/actions/auth';
import {
  getProjectsList,
  getProjectsForSidebar,
  getFavoriteProjectIds,
  addProjectFavorite,
  removeProjectFavorite,
  type ProjectListItem,
} from '@/app/actions/projects';
import { getClients } from '@/app/clients/actions';
import { PROJECT_CATEGORIES } from '@/lib/constants';
import {
  Plus,
  FolderKanban,
  Search,
  Star,
  SlidersHorizontal,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
type Project = Database['public']['Tables']['projects']['Row'];
type Client = Database['public']['Tables']['clients']['Row'];

interface ProjectsPageClientProps {
  initialProjects: ProjectListItem[];
  initialProjectRows: Project[];
  initialClients: Client[];
  initialFavoriteIds: string[];
}

export default function ProjectsPageClient({
  initialProjects,
  initialProjectRows,
  initialClients,
  initialFavoriteIds,
}: ProjectsPageClientProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectListItem[]>(initialProjects);
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [projectRows, setProjectRows] = useState<Project[]>(initialProjectRows);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClientId, setFilterClientId] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(
    () => new Set(initialFavoriteIds)
  );
  const [filtersOpen, setFiltersOpen] = useState(false);

  const loadFavorites = useCallback(async () => {
    const result = await getFavoriteProjectIds();
    setFavoriteIds(new Set(result.ok ? result.data : []));
  }, []);

  const loadProjects = useCallback(async () => {
    setIsLoading(true);
    const list = await getProjectsList();
    setProjects(list);
    setIsLoading(false);
  }, []);

  const loadProjectRows = useCallback(async () => {
    const data = await getProjectsForSidebar();
    setProjectRows(data);
  }, []);

  const loadClients = useCallback(async () => {
    const data = await getClients();
    setClients(data);
  }, []);

  const filtered = useMemo(() => {
    let list = projects;
    if (filterClientId !== 'all') {
      list = list.filter((p) => p.client_id === filterClientId);
    }
    if (filterCategory !== 'all') {
      list = list.filter((p) => p.category === filterCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.client_name?.toLowerCase().includes(q) ?? false)
      );
    }
    // Favorites first, then by name
    return [...list].sort((a, b) => {
      const aFav = favoriteIds.has(a.id);
      const bFav = favoriteIds.has(b.id);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  }, [projects, filterClientId, filterCategory, searchQuery, favoriteIds]);

  const toggleFavorite = async (e: React.MouseEvent, projectId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const isFav = favoriteIds.has(projectId);
    if (isFav) {
      await removeProjectFavorite(projectId);
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
    } else {
      await addProjectFavorite(projectId);
      setFavoriteIds((prev) => new Set(prev).add(projectId));
    }
  };

  const categoryLabel = (key: string) => {
    const found = PROJECT_CATEGORIES.find((c) => c.key === key);
    return found ? t(`projects.category_${found.key}`) : key;
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <TopBar
        searchQuery=""
        onSearchChange={() => {}}
        onSignOut={() => signOut()}
        onProjectAdded={() => {
          loadProjects();
          loadProjectRows();
        }}
        onProjectUpdated={() => {
          loadProjects();
          loadProjectRows();
        }}
        projectName={t('projects.title')}
        currentProject={null}
        onOpenSidebar={() => setSidebarOpen(true)}
        minimal
        showSidebarButtonAlways
      />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          projects={projectRows}
          selectedProject={null}
          selectedCategory={null}
          showArchived={false}
          onSelectProject={() => {}}
          onCategoryChange={() => {}}
          onShowArchivedChange={() => {}}
          onProjectUpdated={() => {
            loadProjects();
            loadProjectRows();
          }}
          mobileOpen={sidebarOpen}
          onMobileClose={() => setSidebarOpen(false)}
          overlayOnly
        />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 min-w-0">
          <div className="max-w-5xl mx-auto w-full">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
              <div className="relative flex-1 min-w-0 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder={t('projects.search_placeholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-background"
                />
              </div>
              {/* Mobile: filtros en diálogo */}
              <Button
                type="button"
                variant="outline"
                className="sm:hidden shrink-0 gap-2"
                onClick={() => setFiltersOpen(true)}
              >
                <SlidersHorizontal className="w-4 h-4" />
                {t('projects.filters')}
              </Button>
              {/* Desktop: dropdowns en línea */}
              <div className="hidden sm:flex sm:items-center gap-2">
                <Select
                  value={filterClientId}
                  onValueChange={setFilterClientId}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder={t('projects.filter_client')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t('projects.all_clients')}
                    </SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={filterCategory}
                  onValueChange={setFilterCategory}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder={t('projects.filter_category')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t('projects.all_categories')}
                    </SelectItem>
                    {PROJECT_CATEGORIES.map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        {t(`projects.category_${c.key}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>{t('projects.filters')}</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4 py-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      {t('projects.filter_client')}
                    </label>
                    <Select
                      value={filterClientId}
                      onValueChange={setFilterClientId}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t('projects.all_clients')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          {t('projects.all_clients')}
                        </SelectItem>
                        {clients.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      {t('projects.filter_category')}
                    </label>
                    <Select
                      value={filterCategory}
                      onValueChange={setFilterCategory}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue
                          placeholder={t('projects.all_categories')}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          {t('projects.all_categories')}
                        </SelectItem>
                        {PROJECT_CATEGORIES.map((c) => (
                          <SelectItem key={c.key} value={c.key}>
                            {t(`projects.category_${c.key}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => setFiltersOpen(false)}>
                    {t('projects.filters_done')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {isLoading ? (
              <p className="text-sm text-muted-foreground">
                {t('common.loading')}
              </p>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 bg-card rounded-lg border border-border">
                <FolderKanban className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-center">
                  {searchQuery ||
                  filterClientId !== 'all' ||
                  filterCategory !== 'all'
                    ? t('projects.no_projects_match')
                    : t('projects.no_projects_yet')}
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((project) => {
                  const isFavorite = favoriteIds.has(project.id);
                  return (
                    <div
                      key={project.id}
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        router.push(`/context/${project.id}/board`)
                      }
                      onKeyDown={(e) =>
                        e.key === 'Enter' &&
                        router.push(`/context/${project.id}/board`)
                      }
                      className="bg-card rounded-lg border border-border p-5 hover:shadow-md transition-all cursor-pointer group relative"
                    >
                      <button
                        type="button"
                        onClick={(e) => toggleFavorite(e, project.id)}
                        className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary transition-colors"
                        aria-label={
                          isFavorite
                            ? t('sidebar.remove_from_favorites')
                            : t('sidebar.add_to_favorites')
                        }
                        title={
                          isFavorite
                            ? t('sidebar.remove_from_favorites')
                            : t('sidebar.add_to_favorites')
                        }
                      >
                        <Star
                          className={`w-4 h-4 ${isFavorite ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground hover:text-foreground'}`}
                        />
                      </button>
                      <h3 className="font-semibold text-foreground truncate pr-8">
                        {project.name}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1 truncate">
                        {project.client_name ?? t('projects.no_client')}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {categoryLabel(project.category)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                const event = new CustomEvent('sidebar-open-add-project');
                window.dispatchEvent(event);
              }}
              aria-label={t('sidebar.add_project')}
              className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background md:bottom-8 md:right-8"
            >
              <Plus className="h-6 w-6" />
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
