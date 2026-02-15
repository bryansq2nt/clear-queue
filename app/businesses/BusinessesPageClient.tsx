'use client';

import { useState, useEffect, useCallback } from 'react';
import { Database } from '@/lib/supabase/types';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import { useI18n } from '@/components/I18nProvider';
import { signOut } from '@/app/actions/auth';
import { Plus } from 'lucide-react';
import { getProjectsForSidebar } from '@/app/actions/projects';
import { getBusinesses, type BusinessWithClient } from '@/app/clients/actions';
import { BusinessCard } from '@/app/clients/components/BusinessCard';
import { CreateBusinessModal } from '@/app/clients/components/CreateBusinessModal';
import { EditBusinessModal } from '@/app/clients/components/EditBusinessModal';

type Project = Database['public']['Tables']['projects']['Row'];
type Business = Database['public']['Tables']['businesses']['Row'];

export default function BusinessesPageClient() {
  const { t } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [businesses, setBusinesses] = useState<BusinessWithClient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingBusiness, setEditingBusiness] = useState<Business | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const loadProjects = useCallback(async () => {
    const data = await getProjectsForSidebar();
    setProjects(data);
  }, []);

  const loadBusinesses = useCallback(async () => {
    setIsLoading(true);
    const data = await getBusinesses();
    setBusinesses(data);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    loadBusinesses();
  }, [loadBusinesses]);

  return (
    <div className="flex flex-col h-screen bg-background">
      <TopBar
        searchQuery=""
        onSearchChange={() => {}}
        onSignOut={() => signOut()}
        onProjectAdded={loadProjects}
        onProjectUpdated={loadProjects}
        projectName={t('businesses.title')}
        currentProject={null}
        onOpenSidebar={() => setSidebarOpen(true)}
        minimal
        showSidebarButtonAlways
      />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          projects={projects}
          selectedProject={null}
          selectedCategory={null}
          showArchived={false}
          onSelectProject={() => {}}
          onCategoryChange={() => {}}
          onShowArchivedChange={() => {}}
          onProjectUpdated={loadProjects}
          mobileOpen={sidebarOpen}
          onMobileClose={() => setSidebarOpen(false)}
          overlayOnly
        />
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {isLoading ? (
            <p className="text-sm text-slate-500">{t('common.loading')}</p>
          ) : businesses.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('businesses.no_businesses_yet')}
            </p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {businesses.map((b) => (
                  <BusinessCard
                    key={b.id}
                    business={b}
                    clientName={b.client_name}
                    clientId={b.client_id}
                    onDeleted={loadBusinesses}
                    onEdit={setEditingBusiness}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                aria-label={t('businesses.add_business')}
                className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background md:bottom-8 md:right-8"
              >
                <Plus className="h-6 w-6" />
              </button>
            </>
          )}
        </div>
      </div>

      <CreateBusinessModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={() => {
          loadBusinesses();
          setIsCreateModalOpen(false);
        }}
      />
      <EditBusinessModal
        business={editingBusiness}
        isOpen={!!editingBusiness}
        onClose={() => setEditingBusiness(null)}
        onUpdated={() => {
          loadBusinesses();
          setEditingBusiness(null);
        }}
      />
    </div>
  );
}
