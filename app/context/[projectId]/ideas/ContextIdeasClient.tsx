'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/shared/I18nProvider';
import { Lightbulb, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { createBoardWithProjectAction } from '@/app/actions/idea-boards';

interface Board {
  id: string;
  name: string;
  description: string | null;
  project_id?: string | null;
}

interface ContextIdeasClientProps {
  projectId: string;
  initialBoards: Board[];
  /** When provided (context cache), called after mutations to refresh list */
  onRefresh?: () => void | Promise<void>;
}

/**
 * Ideas tab — grid of boards. Select a board to open its canvas; clicking Ideas tab again returns here.
 */
export default function ContextIdeasClient({
  projectId,
  initialBoards,
  onRefresh,
}: ContextIdeasClientProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [newBoardOpen, setNewBoardOpen] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreateBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newBoardName.trim();
    if (!name) return;

    setCreating(true);
    const result = await createBoardWithProjectAction(name, projectId);
    if (result.data) {
      setNewBoardName('');
      setNewBoardOpen(false);
      if (onRefresh) await onRefresh();
      router.push(`/context/${projectId}/ideas/board/${result.data.id}`);
    }
    setCreating(false);
  };

  return (
    <div className="p-4 md:p-6 flex-1 overflow-auto">
      <h2 className="text-lg font-semibold text-foreground mb-4">
        {t('ideas.mind_maps_heading')}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {initialBoards.map((board) => (
          <Link
            key={board.id}
            href={`/context/${projectId}/ideas/board/${board.id}`}
            className="rounded-lg border border-border bg-card p-4 hover:border-primary/50 hover:bg-accent/30 transition-colors flex flex-col min-h-[120px]"
          >
            <div className="flex items-start gap-2">
              <Lightbulb className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <h3 className="font-medium text-foreground truncate">
                  {board.name}
                </h3>
                {board.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                    {board.description}
                  </p>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {initialBoards.length === 0 && !newBoardOpen && (
        <p className="text-sm text-muted-foreground mt-4">
          {t('ideas.select_mind_map_or_create')}
        </p>
      )}

      <button
        type="button"
        onClick={() => setNewBoardOpen(true)}
        title={t('ideas.new_mind_map')}
        aria-label={t('ideas.new_mind_map')}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background md:bottom-8 md:right-8"
      >
        <Plus className="w-6 h-6" />
      </button>

      <Dialog open={newBoardOpen} onOpenChange={setNewBoardOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('ideas.new_mind_map')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateBoard} className="space-y-4">
            <Input
              value={newBoardName}
              onChange={(e) => setNewBoardName(e.target.value)}
              placeholder={t('ideas.board_name_placeholder')}
              required
              autoFocus
              className="w-full"
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewBoardOpen(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={creating || !newBoardName.trim()}>
                {creating ? t('common.loading') : t('common.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
