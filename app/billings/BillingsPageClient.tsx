'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { captureWithContext } from '@/lib/sentry';
import { Database } from '@/lib/supabase/types';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import { signOut } from '@/app/actions/auth';
import {
  createBilling,
  getBillings,
  updateBillingStatus,
  updateBilling,
} from './actions';
import { getProjectsForSidebar } from '@/app/actions/projects';
import {
  getClients,
  getProjectsByClientId,
  getProjectsWithoutClient,
} from '@/app/clients/actions';
import { Plus, Pencil } from 'lucide-react';

type Project = Database['public']['Tables']['projects']['Row'];
type Client = Database['public']['Tables']['clients']['Row'];
type Billing = Database['public']['Tables']['billings']['Row'] & {
  projects: { id: string; name: string } | null;
  clients: { id: string; full_name: string } | null;
};

const STATUS_COLORS: Record<Billing['status'], string> = {
  pending: 'bg-amber-500/20 text-amber-700 dark:text-amber-400',
  paid: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
  overdue: 'bg-rose-500/20 text-rose-700 dark:text-rose-400',
  cancelled: 'bg-muted text-muted-foreground',
};

type ClientProject = {
  id: string;
  name: string;
  color: string | null;
  category: string;
};

interface BillingsPageClientProps {
  initialProjects: Project[];
  initialClients: Client[];
  initialBillings: Billing[];
}

export default function BillingsPageClient({
  initialProjects,
  initialClients,
  initialBillings,
}: BillingsPageClientProps) {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [clientProjects, setClientProjects] = useState<ClientProject[]>([]);
  const [projectsWithoutClient, setProjectsWithoutClient] = useState<
    ClientProject[]
  >([]);
  const [billings, setBillings] = useState<Billing[]>(initialBillings);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingBilling, setEditingBilling] = useState<Billing | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [form, setForm] = useState({
    title: '',
    client_id: '' as string,
    client_name: '',
    amount: '',
    due_date: '',
    notes: '',
    project_id: '',
  });

  const { t, formatCurrency } = useI18n();

  const loadProjects = useCallback(async () => {
    const data = await getProjectsForSidebar();
    setProjects(data);
  }, []);

  const loadClients = useCallback(async () => {
    const data = await getClients();
    setClients(data);
  }, []);

  const loadBillings = useCallback(async () => {
    setIsLoading(true);
    const data = await getBillings();
    setBillings(data as Billing[]);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (form.client_id) {
      getProjectsByClientId(form.client_id).then(setClientProjects);
      setProjectsWithoutClient([]);
    } else {
      getProjectsWithoutClient().then(setProjectsWithoutClient);
      setClientProjects([]);
    }
  }, [form.client_id]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return billings;
    const clientDisplay = (b: Billing) =>
      b.clients?.full_name || b.client_name || '';
    return billings.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        clientDisplay(b).toLowerCase().includes(q) ||
        (b.projects?.name || '').toLowerCase().includes(q)
    );
  }, [billings, searchQuery]);

  const summary = useMemo(() => {
    return filtered.reduce(
      (acc, b) => {
        const amount = Number(b.amount) || 0;
        acc.total += amount;
        if (b.status === 'paid') acc.paid += amount;
        if (b.status === 'pending' || b.status === 'overdue')
          acc.pending += amount;
        return acc;
      },
      { total: 0, paid: 0, pending: 0 }
    );
  }, [filtered]);

  const emptyForm = () => ({
    title: '',
    client_id: '' as string,
    client_name: '',
    amount: '',
    due_date: '',
    notes: '',
    project_id: '',
  });

  function openCreate() {
    setEditingBilling(null);
    setForm(emptyForm());
    setIsCreateOpen(true);
  }

  function openEdit(billing: Billing) {
    setEditingBilling(billing);
    setForm({
      title: billing.title,
      client_id: billing.client_id || '',
      client_name: billing.client_name || '',
      amount: String(billing.amount),
      due_date: billing.due_date || '',
      notes: billing.notes || '',
      project_id: billing.project_id || '',
    });
    setIsCreateOpen(true);
  }

  function closeForm() {
    setIsCreateOpen(false);
    setEditingBilling(null);
    setForm(emptyForm());
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const clientId = form.client_id || null;
    const projectId = form.project_id || null;
    const clientName = !form.client_id ? form.client_name : undefined;

    try {
      if (editingBilling) {
        await updateBilling(editingBilling.id, {
          title: form.title,
          client_id: clientId,
          client_name: clientName,
          amount: Number(form.amount),
          due_date: form.due_date || undefined,
          notes: form.notes,
          project_id: projectId,
        });
      } else {
        await createBilling({
          title: form.title,
          client_id: clientId,
          client_name: clientName,
          amount: Number(form.amount),
          due_date: form.due_date || undefined,
          notes: form.notes,
          project_id: projectId,
        });
      }
      closeForm();
      loadBillings();
    } catch (err) {
      captureWithContext(err, {
        module: 'billings',
        action: 'createOrUpdateCharge',
        userIntent: 'Guardar cobro o factura',
        expected: 'El cobro se guarda y aparece en la lista',
      });
      alert(err instanceof Error ? err.message : 'Error saving charge');
    }
  }

  async function handleStatusChange(id: string, status: Billing['status']) {
    await updateBillingStatus(id, status);
    loadBillings();
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <TopBar
        searchQuery=""
        onSearchChange={() => {}}
        onSignOut={() => signOut()}
        onProjectAdded={loadProjects}
        onProjectUpdated={loadProjects}
        projectName={t('billings.title')}
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

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SummaryCard
              label={t('billings.total')}
              valueFormatted={formatCurrency(summary.total)}
            />
            <SummaryCard
              label={t('billings.paid')}
              valueFormatted={formatCurrency(summary.paid)}
            />
            <SummaryCard
              label={t('billings.pending')}
              valueFormatted={formatCurrency(summary.pending)}
            />
          </div>

          {isCreateOpen && (
            <form
              onSubmit={handleSubmit}
              className="bg-card border border-border rounded-xl p-4 grid grid-cols-1 md:grid-cols-2 gap-3"
            >
              <div className="md:col-span-2 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">
                  {editingBilling
                    ? t('billings.edit_charge')
                    : t('billings.new_charge')}
                </h2>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  {t('billings.client_label')}
                </label>
                <select
                  className="w-full border border-border rounded px-3 py-2 bg-background text-foreground"
                  value={form.client_id}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      client_id: e.target.value,
                      project_id: '',
                    }))
                  }
                >
                  <option value="">{t('billings.custom_no_client')}</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
              </div>

              {form.client_id ? (
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    {t('billings.project_label')}
                  </label>
                  <select
                    className="w-full border border-border rounded px-3 py-2 bg-background text-foreground"
                    value={form.project_id}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, project_id: e.target.value }))
                    }
                  >
                    <option value="">{t('billings.no_project')}</option>
                    {clientProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      {t('billings.project_no_client')}
                    </label>
                    <select
                      className="w-full border border-border rounded px-3 py-2 bg-background text-foreground"
                      value={form.project_id}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, project_id: e.target.value }))
                      }
                    >
                      <option value="">{t('billings.no_project')}</option>
                      {projectsWithoutClient.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      {t('billings.client_name_custom')}
                    </label>
                    <input
                      placeholder={t('billings.client_name_placeholder')}
                      className="w-full border border-border rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground"
                      value={form.client_name}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, client_name: e.target.value }))
                      }
                    />
                  </div>
                </>
              )}
              <input
                required
                placeholder={t('billings.charge_title_placeholder')}
                className="border border-border rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground"
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
              />
              <input
                required
                type="number"
                step="0.01"
                min="0"
                placeholder={t('billings.amount_placeholder')}
                className="border border-border rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground"
                value={form.amount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, amount: e.target.value }))
                }
              />
              <input
                type="date"
                className="border border-border rounded px-3 py-2 bg-background text-foreground"
                value={form.due_date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, due_date: e.target.value }))
                }
              />
              <input
                placeholder={t('billings.notes_placeholder')}
                className="border border-border rounded px-3 py-2 md:col-span-2 bg-background text-foreground placeholder:text-muted-foreground"
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
              <div className="md:col-span-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-4 py-2 border border-border rounded-lg bg-background text-foreground hover:bg-accent"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
                >
                  {t('billings.save_charge')}
                </button>
              </div>
            </form>
          )}

          {isLoading ? (
            <div className="text-sm text-muted-foreground">
              {t('billings.loading')}
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
              {t('billings.no_charges')}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">{t('billings.charge')}</th>
                    <th className="text-left p-3">{t('billings.client')}</th>
                    <th className="text-left p-3">{t('billings.project')}</th>
                    <th className="text-left p-3">{t('billings.due')}</th>
                    <th className="text-right p-3">{t('billings.amount')}</th>
                    <th className="text-left p-3">{t('billings.status')}</th>
                    <th className="w-10 p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((billing) => (
                    <tr
                      key={billing.id}
                      className="border-t border-border hover:bg-accent/50"
                    >
                      <td className="p-3">
                        <div className="font-medium text-foreground">
                          {billing.title}
                        </div>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {billing.clients?.full_name ||
                          billing.client_name ||
                          '-'}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {billing.projects?.name || '-'}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {billing.due_date || '-'}
                      </td>
                      <td className="p-3 text-right font-semibold">
                        {formatCurrency(Number(billing.amount))}
                      </td>
                      <td className="p-3">
                        <select
                          value={billing.status}
                          onChange={(e) =>
                            handleStatusChange(
                              billing.id,
                              e.target.value as Billing['status']
                            )
                          }
                          className={`px-2 py-1 rounded border border-border text-xs ${STATUS_COLORS[billing.status]}`}
                        >
                          <option value="pending">
                            {t('billings.pending_status')}
                          </option>
                          <option value="paid">
                            {t('billings.paid_status')}
                          </option>
                          <option value="overdue">
                            {t('billings.overdue_status')}
                          </option>
                          <option value="cancelled">
                            {t('billings.cancelled_status')}
                          </option>
                        </select>
                      </td>
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => openEdit(billing)}
                          className="p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                          aria-label={t('common.edit')}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={openCreate}
        aria-label={t('billings.new_charge')}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background md:bottom-8 md:right-8"
      >
        <Plus className="h-6 w-6" />
      </button>
    </div>
  );
}

function SummaryCard({
  label,
  valueFormatted,
}: {
  label: string;
  valueFormatted: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-2xl font-bold text-foreground mt-2">
        {valueFormatted}
      </div>
    </div>
  );
}
