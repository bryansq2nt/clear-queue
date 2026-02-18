-- Project Vaults Foundation (PR1)
-- - project_files
-- - project_links
-- - project_events
-- - RLS policies
-- - Storage buckets/policies (project-media, project-docs)

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'project_file_kind_enum'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.project_file_kind_enum AS ENUM ('media', 'document');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'project_media_category_enum'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.project_media_category_enum AS ENUM (
      'branding',
      'content',
      'reference',
      'screenshot',
      'mockup',
      'other'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'project_document_category_enum'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.project_document_category_enum AS ENUM (
      'brief',
      'contract',
      'invoice',
      'proposal',
      'report',
      'spreadsheet',
      'notes',
      'other'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'project_link_type_enum'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.project_link_type_enum AS ENUM (
      'environment',
      'tool',
      'resource',
      'social',
      'reference',
      'other'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'project_link_section_enum'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.project_link_section_enum AS ENUM (
      'delivery',
      'infrastructure',
      'product',
      'marketing',
      'operations',
      'client',
      'other'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'project_event_type_enum'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.project_event_type_enum AS ENUM (
      'task_created',
      'task_status_changed',
      'task_completed',
      'note_created',
      'note_updated',
      'file_uploaded',
      'file_archived',
      'link_added',
      'link_updated',
      'link_archived',
      'project_updated'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'project_event_entity_enum'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.project_event_entity_enum AS ENUM (
      'project',
      'task',
      'note',
      'file',
      'link'
    );
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linked_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  kind public.project_file_kind_enum NOT NULL,
  media_category public.project_media_category_enum,
  document_category public.project_document_category_enum,
  title TEXT NOT NULL,
  description TEXT,
  bucket TEXT NOT NULL,
  path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_ext TEXT,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
  checksum_sha256 TEXT,
  width INT,
  height INT,
  duration_seconds NUMERIC(10,2),
  page_count INT,
  source_label TEXT,
  source_url TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  sort_order INT NOT NULL DEFAULT 0,
  is_final BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

  CONSTRAINT project_files_bucket_allowed_chk
    CHECK (bucket IN ('project-media', 'project-docs')),
  CONSTRAINT project_files_kind_bucket_match_chk
    CHECK (
      (kind = 'media'::public.project_file_kind_enum AND bucket = 'project-media')
      OR
      (kind = 'document'::public.project_file_kind_enum AND bucket = 'project-docs')
    ),
  CONSTRAINT project_files_category_match_chk
    CHECK (
      (kind = 'media'::public.project_file_kind_enum AND media_category IS NOT NULL AND document_category IS NULL)
      OR
      (kind = 'document'::public.project_file_kind_enum AND document_category IS NOT NULL AND media_category IS NULL)
    )
);

CREATE TABLE IF NOT EXISTS public.project_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linked_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  provider TEXT,
  link_type public.project_link_type_enum NOT NULL,
  section public.project_link_section_enum NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0,
  open_in_new_tab BOOLEAN NOT NULL DEFAULT TRUE,
  last_checked_at TIMESTAMPTZ,
  status_code INT,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

  CONSTRAINT project_links_url_http_chk CHECK (url ~* '^https?://')
);

CREATE TABLE IF NOT EXISTS public.project_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type public.project_event_type_enum NOT NULL,
  entity_type public.project_event_entity_enum NOT NULL,
  entity_id UUID,
  summary TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  dedupe_key TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_project_files_project_kind_created
  ON public.project_files(project_id, kind, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_files_project_archived_sort
  ON public.project_files(project_id, archived_at, sort_order, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_files_project_linked_task
  ON public.project_files(project_id, linked_task_id);

CREATE INDEX IF NOT EXISTS idx_project_files_owner_created
  ON public.project_files(owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_files_tags_gin
  ON public.project_files USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_project_links_project_pinned_sort
  ON public.project_links(project_id, pinned DESC, sort_order, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_links_project_section_pinned
  ON public.project_links(project_id, section, pinned DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_links_project_type_created
  ON public.project_links(project_id, link_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_links_owner_created
  ON public.project_links(owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_links_tags_gin
  ON public.project_links USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_project_events_project_occurred
  ON public.project_events(project_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_events_project_type_occurred
  ON public.project_events(project_id, event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_events_project_entity_occurred
  ON public.project_events(project_id, entity_type, entity_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_events_owner_occurred
  ON public.project_events(owner_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_events_project_dedupe_occurred
  ON public.project_events(project_id, dedupe_key, occurred_at DESC)
  WHERE dedupe_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS update_project_files_updated_at ON public.project_files;
CREATE TRIGGER update_project_files_updated_at
  BEFORE UPDATE ON public.project_files
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_project_links_updated_at ON public.project_links;
CREATE TRIGGER update_project_links_updated_at
  BEFORE UPDATE ON public.project_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own project files" ON public.project_files;
CREATE POLICY "Users can select own project files"
  ON public.project_files FOR SELECT
  USING (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_files.project_id
        AND p.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own project files" ON public.project_files;
CREATE POLICY "Users can insert own project files"
  ON public.project_files FOR INSERT
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_files.project_id
        AND p.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own project files" ON public.project_files;
CREATE POLICY "Users can update own project files"
  ON public.project_files FOR UPDATE
  USING (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_files.project_id
        AND p.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_files.project_id
        AND p.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete own project files" ON public.project_files;
CREATE POLICY "Users can delete own project files"
  ON public.project_files FOR DELETE
  USING (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_files.project_id
        AND p.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can select own project links" ON public.project_links;
CREATE POLICY "Users can select own project links"
  ON public.project_links FOR SELECT
  USING (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_links.project_id
        AND p.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own project links" ON public.project_links;
CREATE POLICY "Users can insert own project links"
  ON public.project_links FOR INSERT
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_links.project_id
        AND p.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own project links" ON public.project_links;
CREATE POLICY "Users can update own project links"
  ON public.project_links FOR UPDATE
  USING (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_links.project_id
        AND p.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_links.project_id
        AND p.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete own project links" ON public.project_links;
CREATE POLICY "Users can delete own project links"
  ON public.project_links FOR DELETE
  USING (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_links.project_id
        AND p.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can select own project events" ON public.project_events;
CREATE POLICY "Users can select own project events"
  ON public.project_events FOR SELECT
  USING (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_events.project_id
        AND p.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own project events" ON public.project_events;
CREATE POLICY "Users can insert own project events"
  ON public.project_events FOR INSERT
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_events.project_id
        AND p.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own project events" ON public.project_events;
CREATE POLICY "Users can update own project events"
  ON public.project_events FOR UPDATE
  USING (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_events.project_id
        AND p.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_events.project_id
        AND p.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete own project events" ON public.project_events;
CREATE POLICY "Users can delete own project events"
  ON public.project_events FOR DELETE
  USING (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_events.project_id
        AND p.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Storage buckets
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-media', 'project-media', false)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-docs', 'project-docs', false)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;

-- ---------------------------------------------------------------------------
-- Storage helper function for defense-in-depth checks
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.storage_path_belongs_to_owned_project(object_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT
    (storage.foldername(object_name))[1] = auth.uid()::TEXT
    AND (storage.foldername(object_name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = ((storage.foldername(object_name))[2])::UUID
        AND p.owner_id = auth.uid()
    );
$$;

-- ---------------------------------------------------------------------------
-- Storage policies: project-media
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "project_media_insert_owned_project" ON storage.objects;
CREATE POLICY "project_media_insert_owned_project"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'project-media'
    AND public.storage_path_belongs_to_owned_project(name)
  );

DROP POLICY IF EXISTS "project_media_select_owned_project" ON storage.objects;
CREATE POLICY "project_media_select_owned_project"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'project-media'
    AND public.storage_path_belongs_to_owned_project(name)
  );

DROP POLICY IF EXISTS "project_media_update_owned_project" ON storage.objects;
CREATE POLICY "project_media_update_owned_project"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'project-media'
    AND public.storage_path_belongs_to_owned_project(name)
  )
  WITH CHECK (
    bucket_id = 'project-media'
    AND public.storage_path_belongs_to_owned_project(name)
  );

DROP POLICY IF EXISTS "project_media_delete_owned_project" ON storage.objects;
CREATE POLICY "project_media_delete_owned_project"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'project-media'
    AND public.storage_path_belongs_to_owned_project(name)
  );

-- ---------------------------------------------------------------------------
-- Storage policies: project-docs
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "project_docs_insert_owned_project" ON storage.objects;
CREATE POLICY "project_docs_insert_owned_project"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'project-docs'
    AND public.storage_path_belongs_to_owned_project(name)
  );

DROP POLICY IF EXISTS "project_docs_select_owned_project" ON storage.objects;
CREATE POLICY "project_docs_select_owned_project"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'project-docs'
    AND public.storage_path_belongs_to_owned_project(name)
  );

DROP POLICY IF EXISTS "project_docs_update_owned_project" ON storage.objects;
CREATE POLICY "project_docs_update_owned_project"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'project-docs'
    AND public.storage_path_belongs_to_owned_project(name)
  )
  WITH CHECK (
    bucket_id = 'project-docs'
    AND public.storage_path_belongs_to_owned_project(name)
  );

DROP POLICY IF EXISTS "project_docs_delete_owned_project" ON storage.objects;
CREATE POLICY "project_docs_delete_owned_project"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'project-docs'
    AND public.storage_path_belongs_to_owned_project(name)
  );
