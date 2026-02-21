'use client';

import { useState, useEffect } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { captureWithContext } from '@/lib/sentry';
import { X, Package } from 'lucide-react';
import { updateItem } from '../actions';
import { Database } from '@/lib/supabase/types';

type BudgetItem = Database['public']['Tables']['budget_items']['Row'];

interface EditItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: (item: BudgetItem) => void;
  item: BudgetItem;
  budgetId: string;
}

export function EditItemModal({
  isOpen,
  onClose,
  onUpdated,
  item,
  budgetId,
}: EditItemModalProps) {
  const { t } = useI18n();
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description || '');
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [unitPrice, setUnitPrice] = useState(String(item.unit_price));
  const [link, setLink] = useState(item.link || '');
  const [status, setStatus] = useState<'pending' | 'quoted' | 'acquired'>(
    item.status
  );
  const [isRecurrent, setIsRecurrent] = useState(item.is_recurrent);
  const [notes, setNotes] = useState(item.notes || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Update form when item changes
  useEffect(() => {
    if (item) {
      setName(item.name);
      setDescription(item.description || '');
      setQuantity(String(item.quantity));
      setUnitPrice(String(item.unit_price));
      setLink(item.link || '');
      setStatus(item.status);
      setIsRecurrent(item.is_recurrent);
      setNotes(item.notes || '');
    }
  }, [item]);

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
      const updated = await updateItem(item.id, budgetId, {
        name: name.trim(),
        description: description.trim() || undefined,
        quantity: qty,
        unit_price: price,
        link: link.trim() || undefined,
        status,
        is_recurrent: isRecurrent,
        notes: notes.trim() || undefined,
      });

      onUpdated?.(updated as BudgetItem);
      onClose();
    } catch (error) {
      captureWithContext(error, {
        module: 'budgets',
        action: 'updateItem',
        userIntent: 'Actualizar ítem del presupuesto',
        expected: 'Los cambios se guardan',
        extra: { budgetId, itemId: item.id },
      });
      alert('Failed to update item');
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
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center">
              <Package className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {t('budgets.edit_item')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('budgets.item_name_label')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('budgets.item_name_placeholder')}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              required
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('budgets.description_optional')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('budgets.brief_description_placeholder')}
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white resize-none"
            />
          </div>

          {/* Quantity and Unit Price */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('budgets.quantity_label')}
              </label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                min="0.01"
                step="0.01"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('budgets.unit_price_label')}
              </label>
              <input
                type="number"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                min="0"
                step="0.01"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                required
              />
            </div>
          </div>

          {/* Link */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('budgets.link_optional')}
            </label>
            <input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder={t('budgets.link_placeholder')}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('budgets.status_label')}
            </label>
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as 'pending' | 'quoted' | 'acquired')
              }
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
            >
              <option value="pending">
                {t('budgets.item_status_pending')}
              </option>
              <option value="quoted">{t('budgets.item_status_quoted')}</option>
              <option value="acquired">
                {t('budgets.item_status_acquired')}
              </option>
            </select>
          </div>

          {/* Recurrent */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isRecurrent"
              checked={isRecurrent}
              onChange={(e) => setIsRecurrent(e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label
              htmlFor="isRecurrent"
              className="text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {t('budgets.recurrent_item_label')}
            </label>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('budgets.notes_optional')}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('budgets.additional_notes_placeholder')}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg hover:from-blue-700 hover:to-cyan-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {isSubmitting
                ? t('budgets.updating_item')
                : t('budgets.update_item')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
