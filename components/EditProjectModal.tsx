'use client';

import { useState, useEffect } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { updateProject, deleteProject } from '@/app/actions/projects';
import { getClients, getBusinessesByClientId } from '@/app/clients/actions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { PROJECT_CATEGORIES } from '@/lib/constants';
import { Database } from '@/lib/supabase/types';

type Project = Database['public']['Tables']['projects']['Row'];
type Client = Database['public']['Tables']['clients']['Row'];
type Business = Database['public']['Tables']['businesses']['Row'];

interface EditProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectUpdated: () => void;
  project: Project | null;
  defaultTab?: 'details' | 'notes'; // Optional prop to open on a specific tab
}

const COLORS = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#eab308',
  '#84cc16',
  '#22c55e',
  '#10b981',
  '#14b8a6',
  '#06b6d4',
  '#0ea5e9',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#d946ef',
  '#ec4899',
  '#f43f5e',
  '#94a3b8',
  '#64748b',
  '#475569',
];

export function EditProjectModal({
  isOpen,
  onClose,
  onProjectUpdated,
  project,
  defaultTab = 'details',
}: EditProjectModalProps) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>('business');
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [notes, setNotes] = useState<string>('');
  const [clientId, setClientId] = useState<string>('');
  const [businessId, setBusinessId] = useState<string>('');
  const [clients, setClients] = useState<Client[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [activeTab, setActiveTab] = useState<string>(defaultTab);
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (isOpen) getClients().then(setClients);
  }, [isOpen]);

  useEffect(() => {
    if (!clientId) {
      setBusinesses([]);
      setBusinessId('');
      return;
    }
    getBusinessesByClientId(clientId).then((list) => {
      setBusinesses(list);
      setBusinessId((prev) => (list.some((b) => b.id === prev) ? prev : ''));
    });
  }, [clientId]);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setCategory(project.category || 'business');
      setSelectedColor(project.color);
      setNotes(project.notes || '');
      setClientId(project.client_id || '');
      setBusinessId(project.business_id || '');
      setError(null);
      setShowDeleteConfirm(false);
      setNotesSaved(false);
      setActiveTab(defaultTab);
    }
  }, [project, isOpen, defaultTab]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!project) return;

    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('id', project.id);
    formData.append('name', name);
    formData.append('category', category);
    if (selectedColor !== null) formData.append('color', selectedColor || '');
    formData.append('notes', notes || '');
    formData.append('client_id', clientId || '');
    formData.append('business_id', businessId || '');

    const result = await updateProject(formData);

    if (result.error) {
      setError(result.error);
      setIsLoading(false);
    } else {
      onProjectUpdated();
      onClose();
    }
  }

  async function handleDelete() {
    if (!project) return;

    setIsLoading(true);
    setError(null);

    const result = await deleteProject(project.id);

    if (result.error) {
      setError(result.error);
      setIsLoading(false);
      setShowDeleteConfirm(false);
    } else {
      onProjectUpdated();
      onClose();
    }
  }

  async function handleSaveNotes() {
    if (!project) return;

    setIsSavingNotes(true);
    setError(null);
    setNotesSaved(false);

    const formData = new FormData();
    formData.append('id', project.id);
    formData.append('name', project.name);
    formData.append('category', project.category);
    formData.append('color', project.color || '');
    formData.append('notes', notes || '');
    formData.append('client_id', project.client_id || '');
    formData.append('business_id', project.business_id || '');

    const result = await updateProject(formData);

    if (result.error) {
      setError(result.error);
      setIsSavingNotes(false);
    } else {
      setNotesSaved(true);
      setIsSavingNotes(false);
      setTimeout(() => setNotesSaved(false), 2000); // Hide "Saved" indicator after 2 seconds
      onProjectUpdated();
    }
  }

  if (!project) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('projects.edit_title')}</DialogTitle>
          <DialogDescription>
            {t('projects.edit_description')}
          </DialogDescription>
        </DialogHeader>
        {!showDeleteConfirm ? (
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details">
                {t('projects.tab_details')}
              </TabsTrigger>
              <TabsTrigger value="notes">{t('projects.tab_notes')}</TabsTrigger>
            </TabsList>
            <TabsContent value="details">
              <form onSubmit={handleSubmit}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">{t('projects.project_name')}</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t('projects.project_name_placeholder')}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">{t('projects.category')}</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger id="category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PROJECT_CATEGORIES.filter(
                          (c) => c.key !== 'archived'
                        ).map((cat) => (
                          <SelectItem key={cat.key} value={cat.key}>
                            {t(`categories.${cat.key}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-client">
                      {t('projects.client_optional')}
                    </Label>
                    <Select
                      value={clientId || 'none'}
                      onValueChange={(v) => setClientId(v === 'none' ? '' : v)}
                    >
                      <SelectTrigger id="edit-client">
                        <SelectValue
                          placeholder={t('projects.select_client')}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          {t('projects.no_client')}
                        </SelectItem>
                        {clients.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {clientId && (
                    <div className="space-y-2">
                      <Label htmlFor="edit-business">
                        {t('projects.business_optional')}
                      </Label>
                      <Select
                        value={businessId || 'none'}
                        onValueChange={(v) =>
                          setBusinessId(v === 'none' ? '' : v)
                        }
                      >
                        <SelectTrigger id="edit-business">
                          <SelectValue
                            placeholder={t('projects.select_business')}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            {t('projects.no_business')}
                          </SelectItem>
                          {businesses.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>{t('projects.color_optional')}</Label>
                    <div className="grid grid-cols-10 gap-2">
                      {COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() =>
                            setSelectedColor(
                              selectedColor === color ? null : color
                            )
                          }
                          className={`w-8 h-8 rounded-full border-2 transition-all ${
                            selectedColor === color
                              ? 'border-slate-900 scale-110'
                              : 'border-slate-300 hover:border-slate-500'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                  {error && (
                    <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                      {error}
                    </div>
                  )}
                </div>
                <DialogFooter className="flex justify-between">
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isLoading}
                  >
                    {t('projects.delete_project')}
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onClose}
                      disabled={isLoading}
                    >
                      {t('common.cancel')}
                    </Button>
                    <Button type="submit" disabled={isLoading}>
                      {isLoading
                        ? t('projects.saving')
                        : t('projects.save_changes')}
                    </Button>
                  </div>
                </DialogFooter>
              </form>
            </TabsContent>
            <TabsContent value="notes">
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="notes">{t('projects.project_notes')}</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t('projects.project_notes_placeholder')}
                    className="min-h-[300px] font-mono text-sm"
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-500">
                      {t('projects.characters_count', { count: notes.length })}
                    </p>
                    {notesSaved && (
                      <span className="text-xs text-green-600 font-medium">
                        {t('projects.notes_saved')}
                      </span>
                    )}
                  </div>
                </div>
                {error && (
                  <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                    {error}
                  </div>
                )}
                <DialogFooter>
                  <div className="flex gap-2 w-full justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onClose}
                      disabled={isSavingNotes}
                    >
                      {t('projects.close')}
                    </Button>
                    <Button
                      type="button"
                      onClick={handleSaveNotes}
                      disabled={isSavingNotes}
                    >
                      {isSavingNotes
                        ? t('projects.saving')
                        : t('projects.save_notes')}
                    </Button>
                  </div>
                </DialogFooter>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-4 py-4">
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
              <p className="font-semibold mb-2">
                {t('projects.delete_warning')}
              </p>
              <p>{t('projects.delete_warning_tasks')}</p>
            </div>
            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                {error}
              </div>
            )}
            <DialogFooter className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setError(null);
                }}
                disabled={isLoading}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={isLoading}
              >
                {isLoading
                  ? t('projects.deleting')
                  : t('projects.delete_confirm_btn')}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
