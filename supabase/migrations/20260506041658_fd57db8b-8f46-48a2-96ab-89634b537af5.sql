
-- ─── 1. Storage bucket for materials ──────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('subject-materials', 'subject-materials', true, 52428800, NULL)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 52428800;

-- Public read
CREATE POLICY "subject_materials_public_read"
  ON storage.objects FOR SELECT TO public, anon, authenticated
  USING (bucket_id = 'subject-materials');

-- Admin/teacher write
CREATE POLICY "subject_materials_staff_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'subject-materials'
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'teacher'))
  );
CREATE POLICY "subject_materials_staff_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'subject-materials'
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'teacher'))
  );
CREATE POLICY "subject_materials_staff_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'subject-materials'
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'teacher'))
  );

-- ─── 2. Extend hifdh_daily_assignments ───────────────────────────────────
ALTER TABLE public.hifdh_daily_assignments
  ADD COLUMN IF NOT EXISTS target_scope text DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS target_value text,
  ADD COLUMN IF NOT EXISTS weekend_off boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_progress boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS current_position jsonb DEFAULT '{"item_index":0,"page_offset":0}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_advance_date date,
  ADD COLUMN IF NOT EXISTS days_completed integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS program_days integer DEFAULT 30;

-- Validation trigger for target_scope
CREATE OR REPLACE FUNCTION public.validate_hifdh_target_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.target_scope NOT IN ('individual','level','group','all') THEN
    RAISE EXCEPTION 'Invalid target_scope: %', NEW.target_scope;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS hifdh_assignment_validate_scope ON public.hifdh_daily_assignments;
CREATE TRIGGER hifdh_assignment_validate_scope
  BEFORE INSERT OR UPDATE ON public.hifdh_daily_assignments
  FOR EACH ROW EXECUTE FUNCTION public.validate_hifdh_target_scope();

-- ─── 3. Bulk-assign RPC ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_bulk_assign_hifdh_revision(
  p_target_scope text,
  p_target_value text,
  p_mode         text,
  p_selected_items integer[],
  p_daily_pages    numeric,
  p_program_days   integer DEFAULT 30,
  p_weekend_off    boolean DEFAULT true,
  p_auto_progress  boolean DEFAULT true,
  p_reciter_id     text    DEFAULT 'Alafasy_128kbps',
  p_notes          text    DEFAULT NULL
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_count integer := 0;
  v_student_ids uuid[];
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'teacher')) THEN
    RAISE EXCEPTION 'Only admins and teachers can bulk-assign';
  END IF;

  -- Collect target students
  IF p_target_scope = 'individual' THEN
    v_student_ids := ARRAY[p_target_value::uuid];
  ELSIF p_target_scope = 'all' THEN
    SELECT array_agg(user_id) INTO v_student_ids
      FROM public.profiles WHERE role = 'student';
  ELSIF p_target_scope = 'level' THEN
    SELECT array_agg(user_id) INTO v_student_ids
      FROM public.profiles WHERE role = 'student' AND level = p_target_value;
  ELSIF p_target_scope = 'group' THEN
    -- Treat group as a level slug fallback for now
    SELECT array_agg(user_id) INTO v_student_ids
      FROM public.profiles WHERE role = 'student' AND level = p_target_value;
  ELSE
    RAISE EXCEPTION 'Invalid target_scope: %', p_target_scope;
  END IF;

  IF v_student_ids IS NULL OR array_length(v_student_ids,1) IS NULL THEN
    RETURN 0;
  END IF;

  -- Deactivate previous active assignments for these students
  UPDATE public.hifdh_daily_assignments
    SET active = false, updated_at = now()
    WHERE active = true AND student_id = ANY(v_student_ids);

  -- Insert new assignment per student
  INSERT INTO public.hifdh_daily_assignments
    (student_id, assigned_by, mode, selected_items, daily_pages,
     reciter_id, notes, active, target_scope, target_value,
     weekend_off, auto_progress, current_position,
     program_days, days_completed, starts_on, last_advance_date)
  SELECT
    sid, auth.uid(), p_mode, p_selected_items, p_daily_pages,
    COALESCE(p_reciter_id,'Alafasy_128kbps'), p_notes, true,
    p_target_scope, p_target_value,
    p_weekend_off, p_auto_progress,
    '{"item_index":0,"page_offset":0}'::jsonb,
    p_program_days, 0, CURRENT_DATE, NULL
  FROM unnest(v_student_ids) AS sid;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

-- ─── 4. Daily auto-advance RPC (called by pg_cron) ───────────────────────
CREATE OR REPLACE FUNCTION public.admin_advance_hifdh_revision_daily()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_advanced integer := 0;
  v_today    date := CURRENT_DATE;
  v_dow      integer := EXTRACT(DOW FROM CURRENT_DATE)::integer;  -- 0=Sun
  rec record;
  v_pos jsonb;
  v_new_idx integer;
  v_new_off numeric;
BEGIN
  FOR rec IN
    SELECT * FROM public.hifdh_daily_assignments
     WHERE active = true AND auto_progress = true
       AND (last_advance_date IS NULL OR last_advance_date < v_today)
  LOOP
    -- Skip Sundays for weekend_off assignments
    IF rec.weekend_off AND v_dow = 0 THEN
      UPDATE public.hifdh_daily_assignments
        SET last_advance_date = v_today
        WHERE id = rec.id;
      CONTINUE;
    END IF;

    v_pos := COALESCE(rec.current_position, '{"item_index":0,"page_offset":0}'::jsonb);
    v_new_idx := COALESCE((v_pos->>'item_index')::integer, 0);
    v_new_off := COALESCE((v_pos->>'page_offset')::numeric, 0) + COALESCE(rec.daily_pages, 1);

    -- A juz is ~20 pages, hizb ~10, surah varies (we just bump page_offset)
    -- Advance to next item every ~20 pages for juz, ~10 for hizb
    DECLARE pages_per_item numeric := CASE rec.mode WHEN 'juz' THEN 20 WHEN 'hizb' THEN 10 ELSE 999 END;
    BEGIN
      WHILE v_new_off >= pages_per_item AND v_new_idx + 1 < COALESCE(array_length(rec.selected_items,1),1) LOOP
        v_new_idx := v_new_idx + 1;
        v_new_off := v_new_off - pages_per_item;
      END LOOP;
    END;

    UPDATE public.hifdh_daily_assignments
      SET current_position = jsonb_build_object('item_index', v_new_idx, 'page_offset', v_new_off),
          last_advance_date = v_today,
          days_completed    = COALESCE(days_completed,0) + 1,
          active = CASE WHEN COALESCE(days_completed,0) + 1 >= COALESCE(program_days,30)
                        THEN false ELSE true END,
          updated_at = now()
      WHERE id = rec.id;
    v_advanced := v_advanced + 1;
  END LOOP;
  RETURN v_advanced;
END $$;

-- ─── 5. Schedule daily advance ───────────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('hifdh-revision-daily-advance');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule(
  'hifdh-revision-daily-advance',
  '0 1 * * *',
  $$ SELECT public.admin_advance_hifdh_revision_daily(); $$
);
