'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/types'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import { signOut } from '@/app/actions/auth'
import { createBilling, getBillings, updateBillingStatus } from './actions'
import { getClients, getProjectsByClientId, getProjectsWithoutClient } from '@/app/clients/actions'
import { Plus } from 'lucide-react'

type Project = Database['public']['Tables']['projects']['Row']
type Client = Database['public']['Tables']['clients']['Row']
type Billing = Database['public']['Tables']['billings']['Row'] & {
  projects: { id: string; name: string } | null
  clients: { id: string; full_name: string } | null
}

const STATUS_COLORS: Record<Billing['status'], string> = {
  pending: 'bg-amber-500/20 text-amber-700 dark:text-amber-400',
  paid: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
  overdue: 'bg-rose-500/20 text-rose-700 dark:text-rose-400',
  cancelled: 'bg-muted text-muted-foreground',
}

type ClientProject = { id: string; name: string; color: string | null; category: string }

export default function BillingsPageClient() {
  const [projects, setProjects] = useState<Project[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [clientProjects, setClientProjects] = useState<ClientProject[]>([])
  const [projectsWithoutClient, setProjectsWithoutClient] = useState<ClientProject[]>([])
  const [billings, setBillings] = useState<Billing[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [form, setForm] = useState({
    title: '',
    client_id: '' as string,
    client_name: '',
    amount: '',
    due_date: '',
    notes: '',
    project_id: '',
  })

  const supabase = createClient()

  const loadProjects = useCallback(async () => {
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: true })
    if (data) setProjects(data as Project[])
  }, [supabase])

  const loadClients = useCallback(async () => {
    const data = await getClients()
    setClients(data)
  }, [])

  const loadBillings = useCallback(async () => {
    setIsLoading(true)
    const data = await getBillings()
    setBillings(data as Billing[])
    setIsLoading(false)
  }, [])

  useEffect(() => {
    loadProjects()
    loadClients()
    loadBillings()
  }, [loadProjects, loadClients, loadBillings])

  useEffect(() => {
    if (form.client_id) {
      getProjectsByClientId(form.client_id).then(setClientProjects)
      setProjectsWithoutClient([])
    } else {
      getProjectsWithoutClient().then(setProjectsWithoutClient)
      setClientProjects([])
    }
    setForm((f) => ({ ...f, project_id: '' }))
  }, [form.client_id])

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return billings
    const clientDisplay = (b: Billing) => b.clients?.full_name || b.client_name || ''
    return billings.filter((b) =>
      b.title.toLowerCase().includes(q) ||
      clientDisplay(b).toLowerCase().includes(q) ||
      (b.projects?.name || '').toLowerCase().includes(q)
    )
  }, [billings, searchQuery])

  const summary = useMemo(() => {
    return filtered.reduce(
      (acc, b) => {
        const amount = Number(b.amount) || 0
        acc.total += amount
        if (b.status === 'paid') acc.paid += amount
        if (b.status === 'pending' || b.status === 'overdue') acc.pending += amount
        return acc
      },
      { total: 0, paid: 0, pending: 0 }
    )
  }, [filtered])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    const clientId = form.client_id || null
    const projectId = form.project_id || null
    const clientName = !form.client_id ? form.client_name : undefined

    await createBilling({
      title: form.title,
      client_id: clientId,
      client_name: clientName,
      amount: Number(form.amount),
      due_date: form.due_date || undefined,
      notes: form.notes,
      project_id: projectId,
    })
    setForm({ title: '', client_id: '', client_name: '', amount: '', due_date: '', notes: '', project_id: '' })
    setIsCreateOpen(false)
    loadBillings()
  }

  async function handleStatusChange(id: string, status: Billing['status']) {
    await updateBillingStatus(id, status)
    loadBillings()
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <TopBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSignOut={() => signOut()}
        onProjectAdded={loadProjects}
        onProjectUpdated={loadProjects}
        projectName="Billings"
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

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Billings</h1>
              <p className="text-muted-foreground mt-2">Track invoices and pending charges per project.</p>
            </div>
            <button
              onClick={() => setIsCreateOpen((v) => !v)}
              className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg font-medium"
            >
              <Plus className="w-5 h-5 mr-2" />
              New Charge
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SummaryCard label="Total" value={summary.total} />
            <SummaryCard label="Paid" value={summary.paid} />
            <SummaryCard label="Pending" value={summary.pending} />
          </div>

          {isCreateOpen && (
            <form onSubmit={handleCreate} className="bg-card border border-border rounded-xl p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Client</label>
                <select
                  className="w-full border rounded px-3 py-2"
                  value={form.client_id}
                  onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
                >
                  <option value="">Custom / No client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.full_name}</option>
                  ))}
                </select>
              </div>

              {form.client_id ? (
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Project</label>
                  <select
                    className="w-full border rounded px-3 py-2"
                    value={form.project_id}
                    onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}
                  >
                    <option value="">No project</option>
                    {clientProjects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Project (without client)</label>
                    <select
                      className="w-full border rounded px-3 py-2"
                      value={form.project_id}
                      onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}
                    >
                      <option value="">No project</option>
                      {projectsWithoutClient.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Client name (custom, optional)</label>
                    <input
                      placeholder="Enter client name"
                      className="w-full border rounded px-3 py-2"
                      value={form.client_name}
                      onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
                    />
                  </div>
                </>
              )}
              <input required placeholder="Charge title" className="border rounded px-3 py-2" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
              <input required type="number" step="0.01" min="0" placeholder="Amount" className="border rounded px-3 py-2" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
              <input type="date" className="border rounded px-3 py-2" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
              <input placeholder="Notes" className="border rounded px-3 py-2 md:col-span-2" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              <div className="md:col-span-2 flex justify-end">
                <button className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90">Save charge</button>
              </div>
            </form>
          )}

          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading billings...</div>
          ) : filtered.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">No charges yet.</div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Charge</th>
                    <th className="text-left p-3">Client</th>
                    <th className="text-left p-3">Project</th>
                    <th className="text-left p-3">Due</th>
                    <th className="text-right p-3">Amount</th>
                    <th className="text-left p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((billing) => (
                    <tr key={billing.id} className="border-t border-border hover:bg-accent/50">
                      <td className="p-3">
                        <div className="font-medium text-foreground">{billing.title}</div>
                      </td>
                      <td className="p-3 text-muted-foreground">{billing.clients?.full_name || billing.client_name || '-'}</td>
                      <td className="p-3 text-muted-foreground">{billing.projects?.name || '-'}</td>
                      <td className="p-3 text-muted-foreground">{billing.due_date || '-'}</td>
                      <td className="p-3 text-right font-semibold">${Number(billing.amount).toFixed(2)}</td>
                      <td className="p-3">
                        <select
                          value={billing.status}
                          onChange={(e) => handleStatusChange(billing.id, e.target.value as Billing['status'])}
                          className={`px-2 py-1 rounded border border-border text-xs ${STATUS_COLORS[billing.status]}`}
                        >
                          <option value="pending">Pending</option>
                          <option value="paid">Paid</option>
                          <option value="overdue">Overdue</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold text-foreground mt-2">${value.toFixed(2)}</div>
    </div>
  )
}
