'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/types'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import { signOut } from '@/app/actions/auth'
import { createBilling, getBillings, updateBillingStatus } from './actions'
import { Plus } from 'lucide-react'

type Project = Database['public']['Tables']['projects']['Row']
type Billing = Database['public']['Tables']['billings']['Row'] & { projects: { id: string; name: string } | null }

const STATUS_COLORS: Record<Billing['status'], string> = {
  pending: 'bg-amber-100 text-amber-700',
  paid: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-rose-100 text-rose-700',
  cancelled: 'bg-slate-100 text-slate-700',
}

export default function BillingsPageClient() {
  const [projects, setProjects] = useState<Project[]>([])
  const [billings, setBillings] = useState<Billing[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [form, setForm] = useState({ title: '', client_name: '', amount: '', due_date: '', notes: '', project_id: '' })

  const supabase = createClient()

  const loadProjects = useCallback(async () => {
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: true })
    if (data) setProjects(data as Project[])
  }, [supabase])

  const loadBillings = useCallback(async () => {
    setIsLoading(true)
    const data = await getBillings()
    setBillings(data as Billing[])
    setIsLoading(false)
  }, [])

  useEffect(() => {
    loadProjects()
    loadBillings()
  }, [loadProjects, loadBillings])

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return billings
    return billings.filter((b) =>
      b.title.toLowerCase().includes(q) ||
      (b.client_name || '').toLowerCase().includes(q) ||
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
    await createBilling({
      title: form.title,
      client_name: form.client_name,
      amount: Number(form.amount),
      due_date: form.due_date,
      notes: form.notes,
      project_id: form.project_id,
    })
    setForm({ title: '', client_name: '', amount: '', due_date: '', notes: '', project_id: '' })
    setIsCreateOpen(false)
    loadBillings()
  }

  async function handleStatusChange(id: string, status: Billing['status']) {
    await updateBillingStatus(id, status)
    loadBillings()
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50">
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
              <h1 className="text-3xl font-bold text-gray-900">Billings</h1>
              <p className="text-gray-600 mt-2">Track invoices and pending charges per project.</p>
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
            <form onSubmit={handleCreate} className="bg-white border rounded-xl p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <input required placeholder="Charge title" className="border rounded px-3 py-2" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
              <input placeholder="Client name" className="border rounded px-3 py-2" value={form.client_name} onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))} />
              <input required type="number" step="0.01" min="0" placeholder="Amount" className="border rounded px-3 py-2" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
              <input type="date" className="border rounded px-3 py-2" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
              <select className="border rounded px-3 py-2" value={form.project_id} onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}>
                <option value="">No project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
              <input placeholder="Notes" className="border rounded px-3 py-2" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              <div className="md:col-span-2 flex justify-end">
                <button className="px-4 py-2 bg-slate-900 text-white rounded">Save charge</button>
              </div>
            </form>
          )}

          {isLoading ? (
            <div className="text-sm text-slate-500">Loading billings...</div>
          ) : filtered.length === 0 ? (
            <div className="bg-white border rounded-xl p-8 text-center text-slate-500">No charges yet.</div>
          ) : (
            <div className="bg-white border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left p-3">Charge</th>
                    <th className="text-left p-3">Project</th>
                    <th className="text-left p-3">Due</th>
                    <th className="text-right p-3">Amount</th>
                    <th className="text-left p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((billing) => (
                    <tr key={billing.id} className="border-t">
                      <td className="p-3">
                        <div className="font-medium text-slate-800">{billing.title}</div>
                        {billing.client_name && <div className="text-xs text-slate-500">{billing.client_name}</div>}
                      </td>
                      <td className="p-3 text-slate-600">{billing.projects?.name || '-'}</td>
                      <td className="p-3 text-slate-600">{billing.due_date || '-'}</td>
                      <td className="p-3 text-right font-semibold">${Number(billing.amount).toFixed(2)}</td>
                      <td className="p-3">
                        <select
                          value={billing.status}
                          onChange={(e) => handleStatusChange(billing.id, e.target.value as Billing['status'])}
                          className={`px-2 py-1 rounded border text-xs ${STATUS_COLORS[billing.status]}`}
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
    <div className="bg-white border rounded-xl p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-2xl font-bold text-slate-900 mt-2">${value.toFixed(2)}</div>
    </div>
  )
}
