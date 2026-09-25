
CREATE POLICY "Kiosk can upload attendance photos" ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'attendance-photos');
CREATE POLICY "Admins can view attendance photos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'attendance-photos' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete attendance photos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'attendance-photos' AND public.has_role(auth.uid(), 'admin'));
