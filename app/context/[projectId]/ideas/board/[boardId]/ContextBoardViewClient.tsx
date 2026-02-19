'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/I18nProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Pencil } from 'lucide-react';
import IdeaGraphCanvas from '@/app/ideas/IdeaGraphCanvas';
import IdeaDrawer from '@/app/ideas/IdeaDrawer';
import { createIdeaAction } from '@/app/ideas/actions';
import {
  updateBoardAction,
  addIdeaToBoardAction,
} from '@/app/ideas/boards/actions';
interface Idea {
  id: string;
  title: string;
  description: string | null;
}

interface Board {
  id: string;
  name: string;
  description: string | null;
  project_id?: string | null;
}

interface BoardItem {
  id: string;
  idea_id: string;
  x: number;
  y: number;
  idea: Idea;
}

interface Connection {
  id: string;
  from_idea_id: string;
  to_idea_id: string;
  type: string;
}

interface ContextBoardViewClientProps {
  projectId: string;
  boardId: string;
  initialBoard: Board;
  initialItems: BoardItem[];
  initialConnections: Connection[];
  initialProjects: { id: string; name: string }[];
}

export default function ContextBoardViewClient({
  projectId,
  boardId,
  initialBoard,
  initialItems,
  initialConnections,
  initialProjects,
}: ContextBoardViewClientProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [board, setBoard] = useState(initialBoard);
  const [boardItems, setBoardItems] = useState<BoardItem[]>(initialItems);
  const [connections, setConnections] = useState<Connection[]>(initialConnections);
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [isCreatingIdea, setIsCreatingIdea] = useState(false);
  const [isEditingBoard, setIsEditingBoard] = useState(false);
  const [isSavingBoard, setIsSavingBoard] = useState(false);
  const [boardEditError, setBoardEditError] = useState<string | null>(null);

  useEffect(() => {
    setBoardItems(initialItems);
    setConnections(initialConnections);
    setBoard(initialBoard);
  }, [initialItems, initialConnections, initialBoard]);

  const handleCreateIdea = async (formData: FormData) => {
    const result = await createIdeaAction(formData);
    if (result.data) {
      const addFormData = new FormData();
      addFormData.append('boardId', boardId);
      addFormData.append('ideaId', result.data.id);
      addFormData.append('x', '400');
      addFormData.append('y', '300');
      await addIdeaToBoardAction(addFormData);
      router.refresh();
      setIsCreatingIdea(false);
    }
  };

  const handleRefresh = useCallback(() => {
    router.refresh();
  }, [router]);

  const handleUpdateBoard = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBoardEditError(null);
    setIsSavingBoard(true);
    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set('id', boardId);
    try {
      const result = await updateBoardAction(formData);
      if (result.data) {
        setBoard((prev) => ({ ...prev, ...result.data }));
        setIsEditingBoard(false);
        router.refresh();
      } else {
        setBoardEditError(result.error ?? t('common.error'));
      }
    } finally {
      setIsSavingBoard(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b border-border bg-card px-4 py-3">
        <div className="flex items-center justify-center gap-2 relative">
          <h2 className="text-lg font-semibold text-foreground truncate max-w-[70%] text-center">
            {board.name}
          </h2>
          <button
            type="button"
            onClick={() => setIsEditingBoard(true)}
            className="absolute right-0 top-1/2 -translate-y-1/2 p-2 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            title={t('ideas.edit_mind_map')}
            aria-label={t('ideas.edit_mind_map')}
          >
            <Pencil className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 relative min-h-0">
        <IdeaGraphCanvas
          boardId={boardId}
          items={boardItems}
          connections={connections}
          onNodeClick={setSelectedIdeaId}
          onRefresh={handleRefresh}
        />
      </div>

      <button
        type="button"
        onClick={() => setIsCreatingIdea(true)}
        title={t('ideas.add_word')}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background md:bottom-8 md:right-8"
        aria-label={t('ideas.add_word')}
      >
        <Plus className="w-6 h-6" />
      </button>

      <Dialog open={isCreatingIdea} onOpenChange={setIsCreatingIdea}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('ideas.add_word')}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleCreateIdea(new FormData(e.currentTarget));
            }}
            className="space-y-4"
          >
            <Input
              name="title"
              placeholder={t('ideas.new_word_placeholder')}
              required
              className="w-full"
              autoFocus
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreatingIdea(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit">{t('common.add')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isEditingBoard}
        onOpenChange={(open) => {
          if (!open) {
            setIsEditingBoard(false);
            setBoardEditError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('ideas.edit_mind_map')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateBoard} className="space-y-4">
            <input type="hidden" name="id" value={boardId} />
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t('ideas.board_name_placeholder')}
              </label>
              <Input
                name="name"
                defaultValue={board.name}
                placeholder={t('ideas.board_name_placeholder')}
                className="w-full"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                {t('ideas.board_description_placeholder')}
              </label>
              <Textarea
                name="description"
                defaultValue={board.description ?? ''}
                placeholder={t('ideas.board_description_placeholder')}
                rows={3}
                className="w-full resize-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                {t('ideas.link_board_to_project')}
              </label>
              <select
                name="projectId"
                defaultValue={board.project_id ?? ''}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">{t('ideas.no_project')}</option>
                {initialProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            {boardEditError && (
              <p className="text-sm text-destructive">{boardEditError}</p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsEditingBoard(false);
                  setBoardEditError(null);
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={isSavingBoard}>
                {isSavingBoard ? t('common.loading') : t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {selectedIdeaId && (
        <IdeaDrawer
          ideaId={selectedIdeaId}
          isOpen={!!selectedIdeaId}
          onClose={() => setSelectedIdeaId(null)}
          onUpdate={handleRefresh}
        />
      )}
    </div>
  );
}
