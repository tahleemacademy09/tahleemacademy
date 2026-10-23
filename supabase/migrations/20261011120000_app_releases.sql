-- App releases: admin uploads the Android APK, students download it and get
-- told when a newer version exists. The APK itself lives in Cloudflare R2
-- (private bucket, path app-releases/<file>.apk); only the path is stored here.

CREATE TABLE IF NOT EXISTS public.app_releases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform      text NOT NULL DEFAULT 'android' CHECK (platform IN ('android')),
  version_name  text NOT NULL,                 -- e.g. "1.3.0" (shown to people)
  version_code  integer NOT NULL,              -- must equal versionCode in android/app/build.gradle
  release_notes text,
  file_path     text NOT NULL,                 -- R2 object key
  file_name     text NOT NULL,                 -- name the download is saved as
  file_size     bigint,
  is_published  boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, version_code)
);

ALTER TABLE public.app_releases ENABLE ROW LEVEL SECURITY;

-- Public: anyone (even logged out) can see and download published releases.
CREATE POLICY "Anyone reads published releases"
  ON public.app_releases FOR SELECT TO anon, authenticated
  USING (is_published OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage releases"
  ON public.app_releases FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Who downloaded which release (drives the "update" star for people using the
-- APK from the browser, and the download counts in the admin page).
CREATE TABLE IF NOT EXISTS public.app_release_downloads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  release_id    uuid NOT NULL REFERENCES public.app_releases(id) ON DELETE CASCADE,
  version_code  integer NOT NULL,
  downloaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, release_id)
);

ALTER TABLE public.app_release_downloads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own downloads"
  ON public.app_release_downloads FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users record own downloads"
  ON public.app_release_downloads FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS app_releases_latest_idx
  ON public.app_releases (platform, version_code DESC) WHERE is_published;
