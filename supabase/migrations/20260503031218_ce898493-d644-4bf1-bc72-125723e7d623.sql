
CREATE TABLE IF NOT EXISTS public.telegram_bot_state (
  id INT PRIMARY KEY CHECK (id = 1),
  update_offset BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.telegram_bot_state (id, update_offset)
  VALUES (1, 0)
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.telegram_bot_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role only" ON public.telegram_bot_state;
CREATE POLICY "service role only"
  ON public.telegram_bot_state
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
