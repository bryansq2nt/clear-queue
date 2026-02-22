'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/components/shared/I18nProvider';
import { captureWithContext } from '@/lib/sentry';
import { Database } from '@/lib/supabase/types';
import {
  createBilling,
  updateBillingStatus,
  updateBilling,
} from '@/app/actions/billings';
import { getClients } from '@/app/actions/clients';
import { Plus, Pencil } from 'lucide-react';

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

interface ContextBillingsClientProps {
  projectId: string;
  initialBillings: Billing[];
  onRefresh?: () => void | Promise<void>;
}

export default function ContextBillingsClient({
  projectId,
  initialBillings,
  onRefresh,
}: ContextBillingsClientProps) {
  const { t, formatCurrency } = useI18n();
  const [billings, setBillings] = useState<Billing[]>(initialBillings);
  const [clients, setClients] = useState<{ id: string; full_name: string }[]>(
    []
  );
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingBilling, setEditingBilling] = useState<Billing | null>(null);
  const [form, setForm] = useState({
    title: '',
    client_id: '' as string,
    client_name: '',
    amount: '',
    due_date: '',
    notes: '',
  });

  useEffect(() => {
    setBillings(initialBillings);
  }, [initialBillings]);

  const loadClients = useCallback(async () => {
    const data = await getClients();
    setClients(data);
  }, []);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const summary = useMemo(
    () =>
      billings.reduce(
        (acc, b) => {
          const amount = Number(b.amount) || 0;
          acc.total += amount;
          if (b.status === 'paid') acc.paid += amount;
          if (b.status === 'pending' || b.status === 'overdue')
            acc.pending += amount;
          return acc;
        },
        { total: 0, paid: 0, pending: 0 }
      ),
    [billings]
  );

  const emptyForm = () => ({
    title: '',
    client_id: '' as string,
    client_name: '',
    amount: '',
    due_date: '',
    notes: '',
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
      await onRefresh?.();
    } catch (err) {
      captureWithContext(err, {
        module: 'context-billings',
        action: 'createOrUpdateCharge',
        userIntent: 'Guardar cobro',
        expected: 'El cobro se guarda en el proyecto',
      });
      alert(err instanceof Error ? err.message : 'Error saving charge');
    }
  }

  async function handleStatusChange(id: string, status: Billing['status']) {
    await updateBillingStatus(id, status);
    await onRefresh?.();
  }

  return (
    <div className="p-4 md:p-6 min-h-full space-y-6">
      <p className="text-muted-foreground text-sm">{t('billings.subtitle')}</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('billings.total')}
          </div>
          <div className="text-2xl font-bold text-foreground mt-2">
            {formatCurrency(summary.total)}
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('billings.paid')}
          </div>
          <div className="text-2xl font-bold text-foreground mt-2">
            {formatCurrency(summary.paid)}
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('billings.pending')}
          </div>
          <div className="text-2xl font-bold text-foreground mt-2">
            {formatCurrency(summary.pending)}
          </div>
        </div>
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
                setForm((f) => ({ ...f, client_id: e.target.value }))
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
          {!form.client_id && (
            <div className="md:col-span-2">
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
          )}
          <input
            required
            placeholder={t('billings.charge_title_placeholder')}
            className="border border-border rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <input
            required
            type="number"
            step="0.01"
            min="0"
            placeholder={t('billings.amount_placeholder')}
            className="border border-border rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
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
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
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

      {billings.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
          {t('billings.no_charges')}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-left p-3">{t('billings.charge')}</th>
                <th className="text-left p-3">{t('billings.client')}</th>
                <th className="text-left p-3">{t('billings.due')}</th>
                <th className="text-right p-3">{t('billings.amount')}</th>
                <th className="text-left p-3">{t('billings.status')}</th>
                <th className="w-10 p-3"></th>
              </tr>
            </thead>
            <tbody>
              {billings.map((billing) => (
                <tr
                  key={billing.id}
                  className="border-t border-border hover:bg-accent/50"
                >
                  <td className="p-3 font-medium text-foreground">
                    {billing.title}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {billing.clients?.full_name || billing.client_name || '-'}
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
                      <option value="paid">{t('billings.paid_status')}</option>
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
