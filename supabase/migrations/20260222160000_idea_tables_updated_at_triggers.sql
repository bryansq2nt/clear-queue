-- TD-10: ideas, idea_boards, and idea_board_items all have updated_at columns
-- but no BEFORE UPDATE trigger to keep them current.
-- Reuses the shared update_updated_at_column() function from 001_initial_schema.sql.

DROP TRIGGER IF EXISTS update_ideas_updated_at ON public.ideas;
CREATE TRIGGER update_ideas_updated_at
  BEFORE UPDATE ON public.ideas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_idea_boards_updated_at ON public.idea_boards;
CREATE TRIGGER update_idea_boards_updated_at
  BEFORE UPDATE ON public.idea_boards
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_idea_board_items_updated_at ON public.idea_board_items;
CREATE TRIGGER update_idea_board_items_updated_at
  BEFORE UPDATE ON public.idea_board_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
