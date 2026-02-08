-- ============================================
-- NOTES MODULE
-- Notes belong to a project; each note can have multiple links.
-- ============================================

-- ---------------------------------------------------------------------------
-- Table: public.notes
-- ---------------------------------------------------------------------------
CREATE TABLE public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX notes_project_id_idx ON public.notes(project_id);
CREATE INDEX notes_owner_id_idx ON public.notes(owner_id);

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own notes"
  ON public.notes FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own notes"
  ON public.notes FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own notes"
  ON public.notes FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can delete own notes"
  ON public.notes FOR DELETE
  USING (owner_id = auth.uid());

CREATE TRIGGER update_notes_updated_at
  BEFORE UPDATE ON public.notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Table: public.note_links
-- ---------------------------------------------------------------------------
CREATE TABLE public.note_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  title TEXT,
  url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX note_links_note_id_idx ON public.note_links(note_id);

ALTER TABLE public.note_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select note_links of own notes"
  ON public.note_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.id = note_links.note_id AND n.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert note_links for own notes"
  ON public.note_links FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.id = note_links.note_id AND n.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update note_links of own notes"
  ON public.note_links FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.id = note_links.note_id AND n.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.id = note_links.note_id AND n.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete note_links of own notes"
  ON public.note_links FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.id = note_links.note_id AND n.owner_id = auth.uid()
    )
  );
