-- ── Academic Levels: dynamic, admin-managed, non-destructive ──────────────
CREATE TABLE IF NOT EXISTS public.academic_levels (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,
  name_ar       TEXT NOT NULL,
  name_en       TEXT NOT NULL,
  description_ar TEXT,
  description_en TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_academic_levels_active_sort
  ON public.academic_levels (is_active, sort_order);

-- updated_at trigger (re-uses existing public.update_updated_at function)
DROP TRIGGER IF EXISTS trg_academic_levels_updated_at ON public.academic_levels;
CREATE TRIGGER trg_academic_levels_updated_at
  BEFORE UPDATE ON public.academic_levels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.academic_levels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view active levels" ON public.academic_levels;
CREATE POLICY "Authenticated can view active levels"
  ON public.academic_levels
  FOR SELECT
  TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage levels insert" ON public.academic_levels;
CREATE POLICY "Admins manage levels insert"
  ON public.academic_levels
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage levels update" ON public.academic_levels;
CREATE POLICY "Admins manage levels update"
  ON public.academic_levels
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage levels delete" ON public.academic_levels;
CREATE POLICY "Admins manage levels delete"
  ON public.academic_levels
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ── Seed canonical levels (idempotent) ───────────────────────────────────
INSERT INTO public.academic_levels (slug, name_ar, name_en, sort_order, is_active)
VALUES
  ('tamhidi',      'المرحلة التمهيدية', 'Foundation',   0, true),
  ('beginner',     'المستوى المبتدئ',  'Beginner',     1, true),
  ('intermediate', 'المستوى المتوسط',  'Intermediate', 2, true),
  ('advanced',     'المستوى المتقدم',  'Advanced',     3, true)
ON CONFLICT (slug) DO UPDATE
  SET name_ar    = EXCLUDED.name_ar,
      name_en    = EXCLUDED.name_en,
      sort_order = EXCLUDED.sort_order,
      is_active  = true,
      updated_at = now();