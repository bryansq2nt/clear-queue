'use client';

import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { captureWithContext } from '@/lib/sentry';
import { useRouter } from 'next/navigation';
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
import { Plus, PanelLeftOpen, Pencil } from 'lucide-react';
import BoardsSidebar from './BoardsSidebar';
import IdeaGraphCanvas from './IdeaGraphCanvas';
import IdeaDrawer from './IdeaDrawer';
import { createIdeaAction } from './actions';
import {
  createBoardAction,
  updateBoardAction,
  addIdeaToBoardAction,
} from './boards/actions';
import { getBoardDataAction } from './load-board-data';

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

export default function IdeasDashboardClient({
  initialBoards,
  initialIdeas,
  initialProjects = [],
}: {
  initialBoards: Board[];
  initialIdeas: Idea[];
  initialProjects?: { id: string; name: string }[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [boards, setBoards] = useState(initialBoards);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(
    initialBoards.length > 0 ? initialBoards[0].id : null
  );
  const [boardItems, setBoardItems] = useState<BoardItem[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [isCreatingIdea, setIsCreatingIdea] = useState(false);
  const [isCreatingBoard, setIsCreatingBoard] = useState(false);
  const [isEditingBoard, setIsEditingBoard] = useState(false);
  const [isSavingBoard, setIsSavingBoard] = useState(false);
  const [boardEditError, setBoardEditError] = useState<string | null>(null);
  const [newBoardName, setNewBoardName] = useState('');
  const [loading, setLoading] = useState(false);
  const [boardsPanelOpen, setBoardsPanelOpen] = useState(false);

  // Load board data when board is selected
  const loadBoardData = useCallback(async (boardId: string) => {
    setLoading(true);
    try {
      const result = await getBoardDataAction(boardId);
      if (result.error) {
        console.error('Failed to load board:', result.error);
        return;
      }
      // Filter out items without valid ideas (type-safe)
      const items = result.items || [];
      const validItems: BoardItem[] = items
        .map((item) => {
          if (!item.idea) return null;
          return {
            id: item.id,
            idea_id: item.idea_id,
            x: item.x,
            y: item.y,
            idea: {
              id: item.idea.id,
              title: item.idea.title,
              description: item.idea.description,
            },
          };
        })
        .filter((item): item is BoardItem => item !== null);
      setBoardItems(validItems);
      setConnections(result.connections || []);
      if (result.board) {
        setBoards((prev) =>
          prev.map((b) =>
            b.id === result.board!.id ? { ...b, ...result.board } : b
          )
        );
      }
    } catch (error) {
      captureWithContext(error, {
        module: 'ideas',
        action: 'loadBoardData',
        userIntent: 'Cargar datos del board de ideas',
        expected: 'Se muestran nodos y conexiones del canvas',
        extra: { boardId },
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedBoardId) {
      loadBoardData(selectedBoardId);
    }
  }, [selectedBoardId, loadBoardData]);

  const handleCreateIdea = async (formData: FormData) => {
    const result = await createIdeaAction(formData);
    if (result.data && selectedBoardId) {
      // Add idea to current board at default position
      const addFormData = new FormData();
      addFormData.append('boardId', selectedBoardId);
      addFormData.append('ideaId', result.data.id);
      addFormData.append('x', '400');
      addFormData.append('y', '300');
      await addIdeaToBoardAction(addFormData);
      router.refresh();
      setIsCreatingIdea(false);
    }
  };

  const handleCreateBoard = async () => {
    if (!newBoardName.trim()) return;

    const formData = new FormData();
    formData.append('name', newBoardName);
    const result = await createBoardAction(formData);
    if (result.data) {
      setBoards([result.data, ...boards]);
      setSelectedBoardId(result.data.id);
      setNewBoardName('');
      setIsCreatingBoard(false);
      router.refresh();
    }
  };

  const handleNodeClick = (ideaId: string) => {
    setSelectedIdeaId(ideaId);
  };

  const handleCloseDrawer = () => {
    setSelectedIdeaId(null);
  };

  const handleRefresh = () => {
    router.refresh();
    if (selectedBoardId) {
      loadBoardData(selectedBoardId);
    }
  };

  const selectedBoard = selectedBoardId
    ? boards.find((b) => b.id === selectedBoardId)
    : null;

  const handleUpdateBoard = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedBoardId) return;
    setBoardEditError(null);
    setIsSavingBoard(true);
    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set('id', selectedBoardId);
    try {
      const result = await updateBoardAction(formData);
      if (result.data) {
        setBoards((prev) =>
          prev.map((b) =>
            b.id === selectedBoardId ? { ...b, ...result.data } : b
          )
        );
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
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Main Canvas Area — Boards panel is overlay, no layout space when closed */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header */}
        <div className="bg-card border-b border-border p-4">
          <div className="flex items-center gap-2">
            <div className="flex-1 flex justify-start min-w-0">
              <button
                type="button"
                onClick={() => setBoardsPanelOpen(true)}
                className="p-2 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground flex-shrink-0"
                title={t('ideas.open_boards_list')}
                aria-label={t('ideas.open_boards_list')}
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            </div>
            <h2 className="flex-shrink-0 text-lg font-semibold text-foreground truncate max-w-[60vw] px-1">
              {selectedBoardId
                ? selectedBoard?.name || t('ideas.select_board')
                : t('ideas.select_board')}
            </h2>
            <div className="flex-1 flex justify-end min-w-0">
              {selectedBoardId && selectedBoard ? (
                <button
                  type="button"
                  onClick={() => setIsEditingBoard(true)}
                  className="p-2 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground flex-shrink-0"
                  title={t('ideas.edit_board')}
                  aria-label={t('ideas.edit_board')}
                >
                  <Pencil className="w-4 h-4" />
                </button>
              ) : (
                <span className="w-9" />
              )}
            </div>
          </div>
        </div>

        {/* Boards overlay: no layout space when closed */}
        {boardsPanelOpen && (
          <div
            className="fixed inset-0 z-40 flex flex-row animate-in fade-in duration-200"
            aria-modal="true"
            role="dialog"
          >
            <div className="animate-in slide-in-from-left-2 duration-200 flex-shrink-0">
              <BoardsSidebar
                boards={boards}
                selectedBoardId={selectedBoardId}
                onSelectBoard={(id) => {
                  setSelectedBoardId(id);
                  setBoardsPanelOpen(false);
                }}
                onRefresh={handleRefresh}
                isCreatingBoard={isCreatingBoard}
                newBoardName={newBoardName}
                onNewBoardNameChange={setNewBoardName}
                onCreateBoard={handleCreateBoard}
                onCancelNewBoard={() => {
                  setIsCreatingBoard(false);
                  setNewBoardName('');
                }}
                onStartCreateBoard={() => setIsCreatingBoard(true)}
                onEditBoard={(boardId) => {
                  setSelectedBoardId(boardId);
                  setIsEditingBoard(true);
                  setBoardsPanelOpen(false);
                }}
                onClose={() => setBoardsPanelOpen(false)}
              />
            </div>
            <button
              type="button"
              className="flex-1 bg-black/50 min-w-0"
              onClick={() => setBoardsPanelOpen(false)}
              aria-label={t('common.close')}
            />
          </div>
        )}

        {/* Canvas */}
        <div className="flex-1 relative">
          {selectedBoardId ? (
            <IdeaGraphCanvas
              boardId={selectedBoardId}
              items={boardItems}
              connections={connections}
              onNodeClick={handleNodeClick}
              onRefresh={handleRefresh}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-muted-foreground">
                {t('ideas.select_board_or_create')}
              </p>
            </div>
          )}
        </div>

        {/* FAB: Agregar palabra (todos los FABs del módulo Ideas aquí) */}
        <button
          type="button"
          onClick={() => setIsCreatingIdea(true)}
          disabled={!selectedBoardId}
          title={t('ideas.add_word')}
          className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background disabled:pointer-events-none disabled:opacity-50 md:bottom-8 md:right-8"
          aria-label={t('ideas.add_word')}
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>

      {/* Dialog: Agregar palabra */}
      <Dialog open={isCreatingIdea} onOpenChange={setIsCreatingIdea}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('ideas.add_word')}</DialogTitle>
          </DialogHeader>
          <form action={handleCreateIdea} className="space-y-4">
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

      {/* Dialog: Editar tablero */}
      <Dialog
        open={isEditingBoard && !!selectedBoard}
        onOpenChange={(open) => {
          if (!open) {
            setIsEditingBoard(false);
            setBoardEditError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('ideas.edit_board')}</DialogTitle>
          </DialogHeader>
          {selectedBoard && (
            <form onSubmit={handleUpdateBoard} className="space-y-4">
              <input type="hidden" name="id" value={selectedBoard.id} />
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t('ideas.board_name_placeholder')}
                </label>
                <Input
                  name="name"
                  defaultValue={selectedBoard.name}
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
                  defaultValue={selectedBoard.description ?? ''}
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
                  defaultValue={selectedBoard.project_id ?? ''}
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
          )}
        </DialogContent>
      </Dialog>

      {/* Idea Drawer */}
      {selectedIdeaId && (
        <IdeaDrawer
          ideaId={selectedIdeaId}
          isOpen={!!selectedIdeaId}
          onClose={handleCloseDrawer}
          onUpdate={handleRefresh}
        />
      )}
    </div>
  );
}
