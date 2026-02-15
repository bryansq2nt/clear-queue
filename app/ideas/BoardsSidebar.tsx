'use client';

import { useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Layout, Plus, MoreVertical, Edit, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { deleteBoardAction } from './boards/actions';

interface Board {
  id: string;
  name: string;
  description: string | null;
}

export default function BoardsSidebar({
  boards,
  selectedBoardId,
  onSelectBoard,
  onRefresh,
  isCreatingBoard,
  newBoardName,
  onNewBoardNameChange,
  onCreateBoard,
  onCancelNewBoard,
  onStartCreateBoard,
  onEditBoard,
  onClose,
}: {
  boards: Board[];
  selectedBoardId: string | null;
  onSelectBoard: (boardId: string | null) => void;
  onRefresh: () => void;
  isCreatingBoard: boolean;
  newBoardName: string;
  onNewBoardNameChange: (value: string) => void;
  onCreateBoard: () => void;
  onCancelNewBoard: () => void;
  onStartCreateBoard: () => void;
  onEditBoard: (boardId: string) => void;
  onClose?: () => void;
}) {
  const { t } = useI18n();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (boardId: string) => {
    if (!confirm(t('ideas.delete_board_confirm'))) {
      return;
    }

    setDeletingId(boardId);
    const result = await deleteBoardAction(boardId);
    setDeletingId(null);

    if (result.success) {
      if (selectedBoardId === boardId) {
        const nextBoard = boards.find((b) => b.id !== boardId);
        onSelectBoard(nextBoard?.id || null);
      }
      onRefresh();
    }
  };

  return (
    <div className="w-72 h-full bg-card border-r border-border flex flex-col overflow-hidden shadow-xl">
      <div className="p-4 space-y-4 flex-1 overflow-y-auto min-h-0">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide truncate min-w-0">
            {t('ideas.boards_heading')}
          </h3>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground flex-shrink-0"
              title={t('common.close')}
              aria-label={t('common.close')}
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </div>

        <div className="space-y-1">
          {boards.length === 0 && !isCreatingBoard ? (
            <p className="text-sm text-muted-foreground px-2">
              {t('ideas.no_boards_yet')}
            </p>
          ) : (
            boards.map((board) => (
              <div
                key={board.id}
                className={cn(
                  'group flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer',
                  selectedBoardId === board.id
                    ? 'bg-accent text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
                onClick={() => onSelectBoard(board.id)}
              >
                <Layout className="w-4 h-4 flex-shrink-0" />
                <span className="truncate flex-1 min-w-0">{board.name}</span>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    asChild
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      className="p-1 hover:bg-accent rounded transition-opacity flex-shrink-0 opacity-70 hover:opacity-100"
                      onClick={(e) => e.stopPropagation()}
                      title={t('ideas.edit_board')}
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenuItem onClick={() => onEditBoard(board.id)}>
                      <Edit className="w-4 h-4 mr-2" />
                      {t('common.edit')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleDelete(board.id)}
                      disabled={deletingId === board.id}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      {deletingId === board.id
                        ? t('ideas.deleting')
                        : t('common.delete')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))
          )}
        </div>

        {isCreatingBoard ? (
          <div className="space-y-2 pt-2 border-t border-border">
            <Input
              value={newBoardName}
              onChange={(e) => onNewBoardNameChange(e.target.value)}
              placeholder={t('ideas.board_name_placeholder')}
              className="w-full"
              onKeyDown={(e) => {
                if (e.key === 'Enter') onCreateBoard();
                if (e.key === 'Escape') onCancelNewBoard();
              }}
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={onCreateBoard}>
                {t('common.create')}
              </Button>
              <Button size="sm" variant="outline" onClick={onCancelNewBoard}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="w-full mt-2 justify-start gap-2"
            onClick={onStartCreateBoard}
          >
            <Plus className="w-4 h-4" />
            {t('ideas.new_board')}
          </Button>
        )}
      </div>
    </div>
  );
}
