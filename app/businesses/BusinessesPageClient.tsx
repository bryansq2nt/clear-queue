'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/types'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import { useI18n } from '@/components/I18nProvider'
import { signOut } from '@/app/actions/auth'
import { Plus } from 'lucide-react'
import { getBusinesses, type BusinessWithClient } from '@/app/clients/actions'
import { BusinessCard } from '@/app/clients/components/BusinessCard'
import { CreateBusinessModal } from '@/app/clients/components/CreateBusinessModal'
import { EditBusinessModal } from '@/app/clients/components/EditBusinessModal'

type Project = Database['public']['Tables']['projects']['Row']
type Business = Database['public']['Tables']['businesses']['Row']

export default function BusinessesPageClient() {
  const { t } = useI18n()
  const [projects, setProjects] = useState<Project[]>([])
  const [businesses, setBusinesses] = useState<BusinessWithClient[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [editingBusiness, setEditingBusiness] = useState<Business | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const supabase = createClient()

  const loadProjects = useCallback(async () => {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: true })
    if (data) setProjects(data as Project[])
  }, [supabase])

  const loadBusinesses = useCallback(async () => {
    setIsLoading(true)
    const data = await getBusinesses(searchQuery.trim() || undefined)
    setBusinesses(data)
    setIsLoading(false)
  }, [searchQuery])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  useEffect(() => {
    loadBusinesses()
  }, [loadBusinesses])

  return (
    <div className="flex flex-col h-screen bg-background">
      <TopBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSignOut={() => signOut()}
        onProjectAdded={loadProjects}
        onProjectUpdated={loadProjects}
        projectName={t('businesses.title')}
        currentProject={null}
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
        />
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {t('businesses.title')}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {t('businesses.subtitle')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-medium"
            >
              <Plus className="w-4 h-4" />
              {t('businesses.add_business')}
            </button>
          </div>
          {isLoading ? (
            <p className="text-sm text-slate-500">{t('common.loading')}</p>
          ) : businesses.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('businesses.no_businesses_yet')}
            </p>
          ) : (
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
          )}
        </div>
      </div>

      <CreateBusinessModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={() => {
          loadBusinesses()
          setIsCreateModalOpen(false)
        }}
      />
      <EditBusinessModal
        business={editingBusiness}
        isOpen={!!editingBusiness}
        onClose={() => setEditingBusiness(null)}
        onUpdated={() => {
          loadBusinesses()
          setEditingBusiness(null)
        }}
      />
    </div>
  )
}
