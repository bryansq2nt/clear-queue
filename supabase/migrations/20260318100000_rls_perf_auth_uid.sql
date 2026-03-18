-- ============================================================
-- RLS Performance: wrap auth.uid() with (select auth.uid())
--
-- Supabase benchmark: ~95% improvement per policy.
-- Bare auth.uid() is evaluated once per row scanned.
-- (select auth.uid()) is evaluated once per statement — the
-- planner caches the result and inlines it as a constant.
--
-- Scope: personal/owner-only tables created before the RBAC
-- transition migration (20260310100009). Policies that already
-- use is_project_member() / is_org_member() are NOT changed —
-- they are already optimal. Policies from 20260310100009 and
-- later are NOT changed while RBAC is being stabilised.
--
-- Verification after applying (should return 0):
--   SELECT COUNT(*)
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND (qual LIKE '%auth.uid()%' OR with_check LIKE '%auth.uid()%')
--     AND qual NOT LIKE '%(select auth.uid())%'
--     AND with_check NOT LIKE '%(select auth.uid())%';
-- ============================================================

-- ============================================================
-- 1. project_favorites
-- ============================================================

DROP POLICY IF EXISTS "Users can view own favorites" ON public.project_favorites;
CREATE POLICY "Users can view own favorites"
  ON public.project_favorites FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can add own favorites" ON public.project_favorites;
CREATE POLICY "Users can add own favorites"
  ON public.project_favorites FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own favorites" ON public.project_favorites;
CREATE POLICY "Users can delete own favorites"
  ON public.project_favorites FOR DELETE
  USING ((select auth.uid()) = user_id);

-- ============================================================
-- 2. projects — INSERT / UPDATE / DELETE only
--    (SELECT was replaced by RBAC policy in 20260310100009)
-- ============================================================

DROP POLICY IF EXISTS "Users can insert own projects" ON public.projects;
CREATE POLICY "Users can insert own projects"
  ON public.projects FOR INSERT
  WITH CHECK (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own projects" ON public.projects;
CREATE POLICY "Users can update own projects"
  ON public.projects FOR UPDATE
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own projects" ON public.projects;
CREATE POLICY "Users can delete own projects"
  ON public.projects FOR DELETE
  USING (owner_id = (select auth.uid()));

-- ============================================================
-- 3. clients
-- ============================================================

DROP POLICY IF EXISTS "Users can select own clients" ON public.clients;
CREATE POLICY "Users can select own clients"
  ON public.clients FOR SELECT
  USING (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own clients" ON public.clients;
CREATE POLICY "Users can insert own clients"
  ON public.clients FOR INSERT
  WITH CHECK (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own clients" ON public.clients;
CREATE POLICY "Users can update own clients"
  ON public.clients FOR UPDATE
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own clients" ON public.clients;
CREATE POLICY "Users can delete own clients"
  ON public.clients FOR DELETE
  USING (owner_id = (select auth.uid()));

-- ============================================================
-- 4. businesses
-- ============================================================

DROP POLICY IF EXISTS "Users can select own businesses" ON public.businesses;
CREATE POLICY "Users can select own businesses"
  ON public.businesses FOR SELECT
  USING (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own businesses" ON public.businesses;
CREATE POLICY "Users can insert own businesses"
  ON public.businesses FOR INSERT
  WITH CHECK (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own businesses" ON public.businesses;
CREATE POLICY "Users can update own businesses"
  ON public.businesses FOR UPDATE
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own businesses" ON public.businesses;
CREATE POLICY "Users can delete own businesses"
  ON public.businesses FOR DELETE
  USING (owner_id = (select auth.uid()));

-- ============================================================
-- 5. business_media (auth.uid() inside EXISTS subquery)
-- ============================================================

DROP POLICY IF EXISTS "Users can select media of own businesses" ON public.business_media;
CREATE POLICY "Users can select media of own businesses"
  ON public.business_media FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_media.business_id
        AND b.owner_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can insert media in own businesses" ON public.business_media;
CREATE POLICY "Users can insert media in own businesses"
  ON public.business_media FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_media.business_id
        AND b.owner_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update media in own businesses" ON public.business_media;
CREATE POLICY "Users can update media in own businesses"
  ON public.business_media FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_media.business_id
        AND b.owner_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete media in own businesses" ON public.business_media;
CREATE POLICY "Users can delete media in own businesses"
  ON public.business_media FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_media.business_id
        AND b.owner_id = (select auth.uid())
    )
  );

-- ============================================================
-- 6. user_assets
-- ============================================================

DROP POLICY IF EXISTS "Users can select own assets" ON public.user_assets;
CREATE POLICY "Users can select own assets"
  ON public.user_assets FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own assets" ON public.user_assets;
CREATE POLICY "Users can insert own assets"
  ON public.user_assets FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own assets" ON public.user_assets;
CREATE POLICY "Users can delete own assets"
  ON public.user_assets FOR DELETE
  USING ((select auth.uid()) = user_id);

-- ============================================================
-- 7. profiles
-- ============================================================

DROP POLICY IF EXISTS "Users can select own profile" ON public.profiles;
CREATE POLICY "Users can select own profile"
  ON public.profiles FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ============================================================
-- 8. user_preferences
-- ============================================================

DROP POLICY IF EXISTS "Users can select own preferences" ON public.user_preferences;
CREATE POLICY "Users can select own preferences"
  ON public.user_preferences FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own preferences" ON public.user_preferences;
CREATE POLICY "Users can insert own preferences"
  ON public.user_preferences FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own preferences" ON public.user_preferences;
CREATE POLICY "Users can update own preferences"
  ON public.user_preferences FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ============================================================
-- 9. link_categories
-- ============================================================

DROP POLICY IF EXISTS "Users can select own link_categories" ON public.link_categories;
CREATE POLICY "Users can select own link_categories"
  ON public.link_categories FOR SELECT
  USING (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own link_categories" ON public.link_categories;
CREATE POLICY "Users can insert own link_categories"
  ON public.link_categories FOR INSERT
  WITH CHECK (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own link_categories" ON public.link_categories;
CREATE POLICY "Users can update own link_categories"
  ON public.link_categories FOR UPDATE
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own link_categories" ON public.link_categories;
CREATE POLICY "Users can delete own link_categories"
  ON public.link_categories FOR DELETE
  USING (owner_id = (select auth.uid()));

-- ============================================================
-- 10. billing_categories
-- ============================================================

DROP POLICY IF EXISTS "billing_categories_select" ON public.billing_categories;
CREATE POLICY "billing_categories_select"
  ON public.billing_categories FOR SELECT
  USING (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "billing_categories_insert" ON public.billing_categories;
CREATE POLICY "billing_categories_insert"
  ON public.billing_categories FOR INSERT
  WITH CHECK (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "billing_categories_update" ON public.billing_categories;
CREATE POLICY "billing_categories_update"
  ON public.billing_categories FOR UPDATE
  USING (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "billing_categories_delete" ON public.billing_categories;
CREATE POLICY "billing_categories_delete"
  ON public.billing_categories FOR DELETE
  USING (owner_id = (select auth.uid()));

-- ============================================================
-- 11. project_modules (auth.uid() inside EXISTS subquery)
--     Write policies remain owner-only per design.
--     The SELECT has two policies: this owner one + a member
--     one added in 20260317000000_project_modules_member_select.
-- ============================================================

DROP POLICY IF EXISTS "Owner can select project modules" ON public.project_modules;
CREATE POLICY "Owner can select project modules"
  ON public.project_modules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_modules.project_id
        AND p.owner_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Owner can insert project modules" ON public.project_modules;
CREATE POLICY "Owner can insert project modules"
  ON public.project_modules FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_modules.project_id
        AND p.owner_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Owner can update project modules" ON public.project_modules;
CREATE POLICY "Owner can update project modules"
  ON public.project_modules FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_modules.project_id
        AND p.owner_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Owner can delete project modules" ON public.project_modules;
CREATE POLICY "Owner can delete project modules"
  ON public.project_modules FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_modules.project_id
        AND p.owner_id = (select auth.uid())
    )
  );
