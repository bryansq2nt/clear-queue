'use client';

import { useState, useEffect } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { X, Package } from 'lucide-react';
import { createItem } from '../actions';
import { Database } from '@/lib/supabase/types';

type BudgetItem = Database['public']['Tables']['budget_items']['Row'];

interface CreateItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (item: BudgetItem) => void;
  categoryId: string;
  budgetId: string;
}

export function CreateItemModal({
  isOpen,
  onClose,
  onCreated,
  categoryId,
  budgetId,
}: CreateItemModalProps) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('0');
  const [link, setLink] = useState('');
  const [status, setStatus] = useState<'pending' | 'quoted' | 'acquired'>(
    'pending'
  );
  const [isRecurrent, setIsRecurrent] = useState(false);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setName('');
      setDescription('');
      setQuantity('1');
      setUnitPrice('0');
      setLink('');
      setStatus('pending');
      setIsRecurrent(false);
      setNotes('');
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      alert('Please enter an item name');
      return;
    }

    const qty = parseFloat(quantity);
    const price = parseFloat(unitPrice);

    if (isNaN(qty) || qty <= 0) {
      alert('Quantity must be greater than 0');
      return;
    }

    if (isNaN(price) || price < 0) {
      alert('Unit price must be 0 or greater');
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await createItem({
        category_id: categoryId,
        name: name.trim(),
        description: description.trim() || undefined,
        quantity: qty,
        unit_price: price,
        link: link.trim() || undefined,
        status,
        is_recurrent: isRecurrent,
        notes: notes.trim() || undefined,
      });

      onCreated?.(created as BudgetItem);
      onClose();
    } catch (error) {
      console.error('Error creating item:', error);
      alert('Failed to create item');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Close on ESC key
  useEffect(() => {
    if (!isOpen) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg shadow-xl border border-border max-w-2xl w-full max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-background z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
              <Package className="w-5 h-5 text-primary-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              {t('budgets.add_item')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form - compact layout */}
        <form onSubmit={handleSubmit} className="p-4 space-y-2.5">
          <div>
            <label className="block text-sm font-medium text-foreground mb-0.5">
              {t('budgets.item_name_label')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('budgets.item_name_placeholder')}
              className="w-full h-8 px-3 text-sm border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-0.5">
              {t('budgets.description_optional')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('budgets.brief_description_placeholder')}
              rows={1}
              className="w-full px-3 py-1.5 text-sm border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring resize-none min-h-[2rem]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-0.5">
                {t('budgets.quantity_label')}
              </label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                min="0.01"
                step="0.01"
                className="w-full h-8 px-3 text-sm border border-input rounded-md bg-background text-foreground focus:ring-2 focus:ring-ring"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-0.5">
                {t('budgets.unit_price_label')}
              </label>
              <input
                type="number"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                min="0"
                step="0.01"
                className="w-full h-8 px-3 text-sm border border-input rounded-md bg-background text-foreground focus:ring-2 focus:ring-ring"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-0.5">
              {t('budgets.link_optional')}
            </label>
            <input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder={t('budgets.link_placeholder')}
              className="w-full h-8 px-3 text-sm border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <label className="block text-sm font-medium text-foreground mb-0.5">
                {t('budgets.status_label')}
              </label>
              <select
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as 'pending' | 'quoted' | 'acquired')
                }
                className="w-full h-8 px-3 text-sm border border-input rounded-md bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-transparent"
              >
                <option value="pending">
                  {t('budgets.item_status_pending')}
                </option>
                <option value="quoted">
                  {t('budgets.item_status_quoted')}
                </option>
                <option value="acquired">
                  {t('budgets.item_status_acquired')}
                </option>
              </select>
            </div>
            <div className="flex items-center gap-2 pb-0.5">
              <input
                type="checkbox"
                id="isRecurrent"
                checked={isRecurrent}
                onChange={(e) => setIsRecurrent(e.target.checked)}
                className="w-4 h-4 rounded border-input text-primary focus:ring-ring"
              />
              <label
                htmlFor="isRecurrent"
                className="text-sm font-medium text-foreground whitespace-nowrap"
              >
                {t('budgets.recurrent_item_label')}
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-0.5">
              {t('budgets.notes_optional')}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('budgets.additional_notes_placeholder')}
              rows={1}
              className="w-full px-3 py-1.5 text-sm border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring resize-none min-h-[2rem]"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm border border-border rounded-lg bg-background text-foreground hover:bg-accent transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {isSubmitting
                ? t('budgets.creating_item')
                : t('budgets.create_item')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
