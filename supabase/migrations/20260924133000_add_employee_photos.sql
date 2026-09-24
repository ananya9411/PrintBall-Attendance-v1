ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS photo_path text;

-- Employee profile photos are separate from attendance snapshots.
-- The bucket is public so the anonymous attendance kiosk can display employee photos.
INSERT INTO storage.buckets (id, name, public)
VALUES ('employee-photos', 'employee-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Admins upload employee photos" ON storage.objects;
CREATE POLICY "Admins upload employee photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'employee-photos'
  AND public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Admins update employee photos" ON storage.objects;
CREATE POLICY "Admins update employee photos"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'employee-photos'
  AND public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  bucket_id = 'employee-photos'
  AND public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Admins delete employee photos" ON storage.objects;
CREATE POLICY "Admins delete employee photos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'employee-photos'
  AND public.has_role(auth.uid(), 'admin')
);
