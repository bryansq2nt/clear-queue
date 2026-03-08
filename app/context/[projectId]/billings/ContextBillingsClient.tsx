'use client';

import { useCallback, useMemo, useState } from 'react';
import { useI18n } from '@/components/shared/I18nProvider';
import {
  createBilling,
  updateBilling,
  updateBillingStatus,
  deleteBilling,
  createBillingCategory,
  deleteBillingCategory,
  type BillingWithRelations,
  type BillingCategory,
  type Billing,
} from '@/app/actions/billings';
import { MutationErrorDialog } from '@/components/board/MutationErrorDialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, X, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Client {
  id: string;
  full_name: string;
}

interface ContextBillingsClientProps {
  projectId: string;
  initialBillings: BillingWithRelations[];
  initialClients: Client[];
  initialCategories: BillingCategory[];
  projectClientId?: string | null;
  onRefresh?: () => void | Promise<void>;
}

type StatusFilter = 'all' | Billing['status'];
type TypeFilter = 'all' | 'charge' | 'payment' | 'spending';
type DateFilter = 'all' | 'this_month' | 'this_year';

const STATUS_COLORS: Record<Billing['status'], string> = {
  pending: 'bg-amber-500/20 text-amber-700 dark:text-amber-400',
  paid: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
  overdue: 'bg-rose-500/20 text-rose-700 dark:text-rose-400',
  cancelled: 'bg-muted text-muted-foreground',
};

const TYPE_COLORS: Record<string, string> = {
  charge: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  payment: 'bg-violet-500/10 text-violet-700 dark:text-violet-400',
  spending: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
};

const PAYMENT_METHODS = [
  'cash',
  'transfer',
  'card',
  'client_card',
  'other',
] as const;
const PAID_BY_OPTIONS = ['me', 'client', 'other'] as const;

const emptyForm = () => ({
  title: '',
  client_id: '' as string,
  client_name: '',
  amount: '',
  due_date: '',
  notes: '',
  category_id: '' as string,
  billing_type: 'charge' as 'charge' | 'payment' | 'spending',
  issued_at: '',
  payment_method: '' as string,
  paid_by: '' as string,
  expect_reimbursement: false,
  reimburse_to_client_id: '' as string,
});

type FormState = ReturnType<typeof emptyForm>;

// ─── Component ────────────────────────────────────────────────────────────────

export default function ContextBillingsClient({
  projectId,
  initialBillings,
  initialClients,
  initialCategories,
  projectClientId,
  onRefresh,
}: ContextBillingsClientProps) {
  const { t, formatCurrency } = useI18n();

  const [billings, setBillings] =
    useState<BillingWithRelations[]>(initialBillings);
  const [clients] = useState<Client[]>(initialClients);
  const [categories, setCategories] =
    useState<BillingCategory[]>(initialCategories);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBilling, setEditingBilling] =
    useState<BillingWithRelations | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Delete confirm state
  const [deleteTarget, setDeleteTarget] = useState<BillingWithRelations | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);

  // Error dialog
  const [errorDialog, setErrorDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    onRetry: () => Promise<void>;
  }>({ open: false, title: '', message: '', onRetry: async () => {} });

  // Category management
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [catSaving, setCatSaving] = useState(false);
  const [deletingCatId, setDeletingCatId] = useState<string | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');
  const [filterType, setFilterType] = useState<TypeFilter>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterDate, setFilterDate] = useState<DateFilter>('all');

  // ─── Derived data ─────────────────────────────────────────────────────────

  const filteredBillings = useMemo(() => {
    const now = new Date();
    return billings.filter((b) => {
      if (filterStatus !== 'all' && b.status !== filterStatus) return false;
      if (filterType !== 'all' && b.type !== filterType) return false;
      if (filterCategory !== 'all' && b.category_id !== filterCategory)
        return false;
      if (filterDate !== 'all') {
        const ref = b.due_date || b.issued_at || b.created_at;
        if (!ref) return false;
        const d = new Date(ref);
        if (filterDate === 'this_month') {
          if (
            d.getMonth() !== now.getMonth() ||
            d.getFullYear() !== now.getFullYear()
          )
            return false;
        } else if (filterDate === 'this_year') {
          if (d.getFullYear() !== now.getFullYear()) return false;
        }
      }
      return true;
    });
  }, [billings, filterStatus, filterType, filterCategory, filterDate]);

  const summary = useMemo(
    () =>
      filteredBillings.reduce(
        (acc, b) => {
          const amount = Number(b.amount) || 0;
          acc.total += amount;
          if (b.status === 'paid') acc.paid += amount;
          if (b.status === 'pending' || b.status === 'overdue')
            acc.pending += amount;
          if (b.status === 'overdue') acc.overdue += amount;
          return acc;
        },
        { total: 0, paid: 0, pending: 0, overdue: 0 }
      ),
    [filteredBillings]
  );

  const hasFilters =
    filterStatus !== 'all' ||
    filterType !== 'all' ||
    filterCategory !== 'all' ||
    filterDate !== 'all';

  // ─── Modal helpers ────────────────────────────────────────────────────────

  function openCreate() {
    setEditingBilling(null);
    setForm({ ...emptyForm(), client_id: projectClientId ?? '' });
    setModalOpen(true);
  }

  function openEdit(billing: BillingWithRelations) {
    setEditingBilling(billing);
    setForm({
      title: billing.title,
      client_id: billing.client_id || '',
      client_name: billing.client_name || '',
      amount: String(billing.amount),
      due_date: billing.due_date || '',
      notes: billing.notes || '',
      category_id: billing.category_id || '',
      billing_type: billing.type,
      issued_at: billing.issued_at || '',
      payment_method: billing.payment_method || '',
      paid_by: billing.paid_by || '',
      expect_reimbursement: billing.expect_reimbursement ?? false,
      reimburse_to_client_id: billing.reimburse_to_client_id || '',
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingBilling(null);
    setForm(emptyForm());
    setFormError(null);
  }

  // ─── Save handler ─────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    // Front-end validation: due_date must be >= issued_at
    if (form.due_date && form.issued_at && form.due_date < form.issued_at) {
      setFormError(t('billings.due_date_before_issued'));
      return;
    }
    setFormError(null);
    setIsSaving(true);
    const payload = {
      title: form.title,
      client_id: form.client_id || null,
      client_name: form.client_id ? null : form.client_name || null,
      amount: Number(form.amount),
      project_id: projectId,
      due_date: form.due_date || null,
      notes: form.notes || null,
      category_id: form.category_id || null,
      type: form.billing_type,
      issued_at: form.issued_at || null,
      payment_method: form.payment_method || null,
      paid_by: form.paid_by || null,
      expect_reimbursement: form.expect_reimbursement,
      reimburse_to_client_id: form.reimburse_to_client_id || null,
    };

    let result: { error?: string };
    if (editingBilling) {
      result = await updateBilling(editingBilling.id, payload);
    } else {
      const r = await createBilling(payload);
      result = r;
      if (!result.error && r.data) {
        setBillings((prev) => [r.data!, ...prev]);
      }
    }

    setIsSaving(false);

    if (result.error) {
      const retry = async () => handleSave();
      setErrorDialog({
        open: true,
        title: t('mutation_error.title'),
        message: result.error!,
        onRetry: retry,
      });
      return;
    }

    closeModal();
    await onRefresh?.();
  }, [form, editingBilling, projectId, onRefresh, t]);

  // ─── Status change ────────────────────────────────────────────────────────

  async function handleStatusChange(id: string, status: Billing['status']) {
    const result = await updateBillingStatus(id, status);
    if (result.error) {
      setErrorDialog({
        open: true,
        title: t('mutation_error.title'),
        message: result.error,
        onRetry: async () => handleStatusChange(id, status),
      });
      return;
    }
    setBillings((prev) =>
      prev.map((b) =>
        b.id === id
          ? {
              ...b,
              status,
              paid_at: status === 'paid' ? new Date().toISOString() : null,
            }
          : b
      )
    );
    await onRefresh?.();
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const result = await deleteBilling(deleteTarget.id, projectId);
    setIsDeleting(false);
    if (result.error) {
      setDeleteTarget(null);
      setErrorDialog({
        open: true,
        title: t('mutation_error.title'),
        message: result.error,
        onRetry: async () => {
          setDeleteTarget(deleteTarget);
          await handleDelete();
        },
      });
      return;
    }
    setBillings((prev) => prev.filter((b) => b.id !== deleteTarget.id));
    setDeleteTarget(null);
    await onRefresh?.();
  }

  // ─── Categories ───────────────────────────────────────────────────────────

  async function handleAddCategory() {
    if (!newCatName.trim()) return;
    setCatSaving(true);
    const result = await createBillingCategory(newCatName.trim());
    setCatSaving(false);
    if (result.data) {
      setCategories((prev) => [...prev, result.data!]);
      setNewCatName('');
    }
  }

  async function handleDeleteCategory(categoryId: string) {
    setDeletingCatId(categoryId);
    await deleteBillingCategory(categoryId);
    setCategories((prev) => prev.filter((c) => c.id !== categoryId));
    setDeletingCatId(null);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 min-h-full space-y-5">
      <p className="text-muted-foreground text-sm">{t('billings.subtitle')}</p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: t('billings.total'), value: summary.total },
          { label: t('billings.paid'), value: summary.paid },
          { label: t('billings.pending'), value: summary.pending },
          { label: t('billings.overdue_status'), value: summary.overdue },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="bg-card border border-border rounded-xl p-4"
          >
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {label}
            </div>
            <div className="text-xl font-bold text-foreground mt-1">
              {formatCurrency(value)}
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Filters */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as StatusFilter)}
          className="text-xs border border-border rounded px-2 py-1.5 bg-background text-foreground"
        >
          <option value="all">{t('billings.filter_all_status')}</option>
          <option value="pending">{t('billings.pending_status')}</option>
          <option value="paid">{t('billings.paid_status')}</option>
          <option value="overdue">{t('billings.overdue_status')}</option>
          <option value="cancelled">{t('billings.cancelled_status')}</option>
        </select>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as TypeFilter)}
          className="text-xs border border-border rounded px-2 py-1.5 bg-background text-foreground"
        >
          <option value="all">{t('billings.filter_all_types')}</option>
          <option value="charge">{t('billings.type_charge')}</option>
          <option value="payment">{t('billings.type_payment')}</option>
          <option value="spending">{t('billings.type_spending')}</option>
        </select>

        {categories.length > 0 && (
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="text-xs border border-border rounded px-2 py-1.5 bg-background text-foreground"
          >
            <option value="all">{t('billings.filter_all_categories')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}

        <select
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value as DateFilter)}
          className="text-xs border border-border rounded px-2 py-1.5 bg-background text-foreground"
        >
          <option value="all">{t('billings.filter_all_dates')}</option>
          <option value="this_month">{t('billings.filter_this_month')}</option>
          <option value="this_year">{t('billings.filter_this_year')}</option>
        </select>

        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setFilterStatus('all');
              setFilterType('all');
              setFilterCategory('all');
              setFilterDate('all');
            }}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <X className="h-3 w-3" />
            {t('billings.clear_filters')}
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCatModalOpen(true)}
            className="text-xs border border-border rounded px-3 py-1.5 bg-background text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            {t('billings.manage_categories')}
          </button>
        </div>
      </div>

      {/* Billing table */}
      {filteredBillings.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground text-sm">
          {hasFilters
            ? t('billings.no_charges_filtered')
            : t('billings.no_charges')}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-left p-3">{t('billings.charge')}</th>
                <th className="text-left p-3 hidden sm:table-cell">
                  {t('billings.client')}
                </th>
                <th className="text-left p-3 hidden md:table-cell">
                  {t('billings.type_label')}
                </th>
                <th className="text-left p-3 hidden md:table-cell">
                  {t('billings.category_label')}
                </th>
                <th className="text-left p-3 hidden sm:table-cell">
                  {t('billings.due')}
                </th>
                <th className="text-right p-3">{t('billings.amount')}</th>
                <th className="text-left p-3">{t('billings.status')}</th>
                <th className="w-16 p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filteredBillings.map((billing) => (
                <tr
                  key={billing.id}
                  className="border-t border-border hover:bg-accent/50"
                >
                  <td className="p-3 font-medium text-foreground">
                    <div>{billing.title}</div>
                    {billing.notes && (
                      <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                        {billing.notes}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground hidden sm:table-cell">
                    {billing.client?.full_name || billing.client_name || '—'}
                  </td>
                  <td className="p-3 hidden md:table-cell">
                    <span
                      className={cn(
                        'px-1.5 py-0.5 rounded text-xs font-medium',
                        TYPE_COLORS[billing.type]
                      )}
                    >
                      {t(`billings.type_${billing.type}`)}
                    </span>
                  </td>
                  <td className="p-3 hidden md:table-cell">
                    {billing.billing_categories ? (
                      <span className="text-xs text-muted-foreground">
                        {billing.billing_categories.name}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/40">
                        —
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground text-xs hidden sm:table-cell">
                    {billing.due_date || '—'}
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
                      className={cn(
                        'px-2 py-1 rounded border border-border text-xs',
                        STATUS_COLORS[billing.status]
                      )}
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
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(billing)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                        aria-label={t('common.edit')}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(billing)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label={t('common.delete')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* FAB */}
      <button
        type="button"
        onClick={openCreate}
        aria-label={t('billings.new_charge')}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background md:bottom-8 md:right-8"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* ─── Create / Edit modal ─────────────────────────────────────────────── */}
      <Dialog
        open={modalOpen}
        onOpenChange={(o) => {
          if (!o) closeModal();
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingBilling
                ? t('billings.edit_charge')
                : t('billings.new_charge')}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 pt-2">
            {/* Type selector */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {t('billings.type_label')}
              </label>
              <div className="flex gap-2">
                {(['charge', 'payment', 'spending'] as const).map((t_) => (
                  <button
                    key={t_}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, billing_type: t_ }))}
                    className={cn(
                      'flex-1 py-1.5 rounded border text-xs font-medium transition-colors',
                      form.billing_type === t_
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background text-muted-foreground hover:bg-accent'
                    )}
                  >
                    {t(`billings.type_${t_}`)}
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {t('billings.charge_title_label')} *
              </label>
              <input
                required
                placeholder={t('billings.charge_title_placeholder')}
                className="w-full border border-border rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground text-sm"
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
              />
            </div>

            {/* Client */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {t('billings.client_label')}
              </label>
              <select
                className="w-full border border-border rounded px-3 py-2 bg-background text-foreground text-sm"
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
              <input
                placeholder={t('billings.client_name_placeholder')}
                className="w-full border border-border rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground text-sm"
                value={form.client_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, client_name: e.target.value }))
                }
              />
            )}

            {/* Amount + Category */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  {t('billings.amount')} *
                </label>
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={t('billings.amount_placeholder')}
                  className="w-full border border-border rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground text-sm"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, amount: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  {t('billings.category_label')}
                </label>
                <select
                  className="w-full border border-border rounded px-3 py-2 bg-background text-foreground text-sm"
                  value={form.category_id}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, category_id: e.target.value }))
                  }
                >
                  <option value="">{t('billings.no_category')}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Issue date (charges only) + Due date */}
            <div className="grid grid-cols-2 gap-3">
              {form.billing_type === 'charge' ? (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    {t('billings.issued_at')}
                  </label>
                  <input
                    type="date"
                    className="w-full border border-border rounded px-3 py-2 bg-background text-foreground text-sm"
                    value={form.issued_at}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, issued_at: e.target.value }));
                      setFormError(null);
                    }}
                  />
                </div>
              ) : (
                <div />
              )}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  {t('billings.due')}
                </label>
                <input
                  type="date"
                  className="w-full border border-border rounded px-3 py-2 bg-background text-foreground text-sm"
                  value={form.due_date}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, due_date: e.target.value }));
                    setFormError(null);
                  }}
                />
              </div>
            </div>

            {/* Payment method */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {t('billings.payment_method')}
              </label>
              <select
                className="w-full border border-border rounded px-3 py-2 bg-background text-foreground text-sm"
                value={form.payment_method}
                onChange={(e) =>
                  setForm((f) => ({ ...f, payment_method: e.target.value }))
                }
              >
                <option value="">{t('billings.no_payment_method')}</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {t(`billings.method_${m}`)}
                  </option>
                ))}
              </select>
            </div>

            {/* Spending-specific fields */}
            {form.billing_type === 'spending' && (
              <div className="space-y-3 rounded-lg border border-border p-3 bg-muted/30">
                <p className="text-xs font-medium text-muted-foreground">
                  {t('billings.spending_section')}
                </p>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    {t('billings.paid_by')}
                  </label>
                  <select
                    className="w-full border border-border rounded px-3 py-2 bg-background text-foreground text-sm"
                    value={form.paid_by}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, paid_by: e.target.value }))
                    }
                  >
                    <option value="">{t('billings.paid_by_unset')}</option>
                    {PAID_BY_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {t(`billings.paid_by_${o}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.expect_reimbursement}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        expect_reimbursement: e.target.checked,
                      }))
                    }
                    className="rounded"
                  />
                  {t('billings.expect_reimbursement')}
                </label>
                {form.expect_reimbursement && (
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      {t('billings.reimburse_client')}
                    </label>
                    <select
                      className="w-full border border-border rounded px-3 py-2 bg-background text-foreground text-sm"
                      value={form.reimburse_to_client_id}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          reimburse_to_client_id: e.target.value,
                        }))
                      }
                    >
                      <option value="">{t('billings.no_client')}</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {t('billings.notes_label')}
              </label>
              <textarea
                rows={2}
                placeholder={t('billings.notes_placeholder')}
                className="w-full border border-border rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground text-sm resize-none"
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
            </div>

            {/* Form validation error */}
            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 border border-border rounded-lg bg-background text-foreground hover:bg-accent text-sm"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={isSaving || !form.title.trim() || !form.amount}
                onClick={handleSave}
                className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? t('common.loading') : t('billings.save_charge')}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Delete confirm dialog ────────────────────────────────────────────── */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('billings.delete_title')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('billings.delete_confirm')}
            {deleteTarget && (
              <span className="font-medium text-foreground">
                {' '}
                &quot;{deleteTarget.title}&quot;
              </span>
            )}
            ?
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="px-4 py-2 border border-border rounded-lg bg-background text-foreground hover:bg-accent text-sm"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleDelete}
              className="px-4 py-2 bg-destructive text-destructive-foreground rounded text-sm hover:bg-destructive/90 disabled:opacity-50"
            >
              {isDeleting ? t('common.loading') : t('common.delete')}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Categories modal ──────────────────────────────────────────────────── */}
      <Dialog open={catModalOpen} onOpenChange={setCatModalOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('billings.manage_categories')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                placeholder={t('billings.new_category_placeholder')}
                className="flex-1 border border-border rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground text-sm"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddCategory();
                }}
              />
              <button
                type="button"
                disabled={catSaving || !newCatName.trim()}
                onClick={handleAddCategory}
                className="px-3 py-2 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {t('common.add')}
              </button>
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {categories.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">
                  {t('billings.no_categories')}
                </p>
              ) : (
                categories.map((cat) => (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between px-3 py-1.5 rounded bg-muted/40 text-sm"
                  >
                    <span>{cat.name}</span>
                    <button
                      type="button"
                      disabled={deletingCatId === cat.id}
                      onClick={() => handleDeleteCategory(cat.id)}
                      className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-40"
                      aria-label={t('common.delete')}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Error dialog ─────────────────────────────────────────────────────── */}
      <MutationErrorDialog
        open={errorDialog.open}
        onOpenChange={(o) => setErrorDialog((d) => ({ ...d, open: o }))}
        title={errorDialog.title}
        message={errorDialog.message}
        onTryAgain={errorDialog.onRetry}
        onCancel={() => setErrorDialog((d) => ({ ...d, open: false }))}
      />
    </div>
  );
}
