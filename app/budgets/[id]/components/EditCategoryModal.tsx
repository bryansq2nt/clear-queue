'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { captureWithContext } from '@/lib/sentry';
import { X, FolderPen } from 'lucide-react';
import { updateCategory } from '../actions';

interface EditCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
  category: {
    id: string;
    name: string;
    description: string | null;
  };
  budgetId: string;
}

export function EditCategoryModal({
  isOpen,
  onClose,
  onUpdated,
  category,
  budgetId,
}: EditCategoryModalProps) {
  const { t } = useI18n();
  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(category.name);
    setDescription(category.description ?? '');
  }, [isOpen, category.id, category.name, category.description]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const nextName = name.trim();
    const nextDescription = description.trim();

    if (!nextName) {
      alert('Please enter a category name');
      return;
    }

    setIsSubmitting(true);
    try {
      await updateCategory(category.id, budgetId, {
        name: nextName,
        description: nextDescription,
      });
      onClose();
      onUpdated();
    } catch (error) {
      captureWithContext(error, {
        module: 'budgets',
        action: 'updateCategory',
        userIntent: 'Actualizar categoría',
        expected: 'Los cambios se guardan',
        extra: { budgetId, categoryId: category.id },
      });
      alert('Failed to update category');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Close on ESC key
  useEffect(() => {
    if (!isOpen) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg shadow-xl border border-border max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
              <FolderPen className="w-5 h-5 text-primary-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              {t('budgets.edit_category')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              {t('budgets.category_name_label')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent"
              required
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              {t('budgets.description_optional')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-border rounded-lg bg-background text-foreground hover:bg-accent transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {isSubmitting ? t('budgets.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
