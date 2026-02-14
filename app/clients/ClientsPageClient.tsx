'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/types'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import { useI18n } from '@/components/I18nProvider'
import { signOut } from '@/app/actions/auth'
import { Plus } from 'lucide-react'
import { getClients } from './actions'
import { ClientCard } from './components/ClientCard'
import { CreateClientModal } from './components/CreateClientModal'
import { EditClientModal } from './components/EditClientModal'
import { EmptyState } from './components/EmptyState'

type Project = Database['public']['Tables']['projects']['Row']
type Client = Database['public']['Tables']['clients']['Row']

export default function ClientsPageClient() {
  const { t } = useI18n()
  const [projects, setProjects] = useState<Project[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const supabase = createClient()

  const loadProjects = useCallback(async () => {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: true })
    if (data) setProjects(data as Project[])
  }, [supabase])

  const loadClients = useCallback(async () => {
    setIsLoading(true)
    const data = await getClients()
    setClients(data)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  useEffect(() => {
    loadClients()
  }, [loadClients])

  const filteredClients = searchQuery.trim()
    ? clients.filter((c) => {
        const q = searchQuery.toLowerCase()
        return (
          c.full_name.toLowerCase().includes(q) ||
          (c.email?.toLowerCase().includes(q)) ||
          (c.phone?.toLowerCase().includes(q))
        )
      })
    : clients

  return (
    <div className="flex flex-col h-screen bg-background">
      <TopBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSignOut={() => signOut()}
        onProjectAdded={loadProjects}
        onProjectUpdated={loadProjects}
        projectName={t('clients.title')}
        currentProject={null}
        onOpenSidebar={() => setSidebarOpen(true)}
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
        />
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{t('clients.title')}</h1>
              <p className="text-muted-foreground mt-2">
                {t('clients.subtitle')}
              </p>
            </div>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-slate-600 to-slate-700 text-white rounded-lg font-medium hover:from-slate-700 hover:to-slate-800 transition-all shadow-lg hover:shadow-xl"
            >
              <Plus className="w-5 h-5 mr-2" />
              {t('clients.new_client')}
            </button>
          </div>

          {isLoading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-32 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                ))}
              </div>
            </div>
          ) : clients.length === 0 ? (
            <EmptyState onCreateClick={() => setIsCreateModalOpen(true)} />
          ) : filteredClients.length === 0 ? (
            <div className="bg-card rounded-lg shadow-sm border border-border p-12 text-center">
              <p className="text-muted-foreground">
                No clients match &quot;{searchQuery}&quot;
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredClients.map((client) => (
                  <ClientCard
                    key={client.id}
                    client={client}
                    onDeleted={loadClients}
                    onEdit={setEditingClient}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                aria-label={t('clients.new_client')}
                className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background md:bottom-8 md:right-8"
              >
                <Plus className="h-6 w-6" />
              </button>
            </>
          )}
        </div>
      </div>

      <CreateClientModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={loadClients}
      />
      <EditClientModal
        client={editingClient}
        isOpen={!!editingClient}
        onClose={() => setEditingClient(null)}
        onUpdated={() => {
          loadClients()
          setEditingClient(null)
        }}
      />
    </div>
  )
}
