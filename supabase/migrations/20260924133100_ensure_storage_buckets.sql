-- Required storage buckets for the application.
-- attendance-photos is private; employee-photos is public so the kiosk can display profiles.
INSERT INTO storage.buckets (id, name, public)
VALUES ('attendance-photos', 'attendance-photos', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('employee-photos', 'employee-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;
