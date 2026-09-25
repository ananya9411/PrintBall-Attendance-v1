-- Adds an explicit neutral/cleared state so an admin can clear a day without it becoming Absent.
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'present';

ALTER TABLE public.attendance
  DROP CONSTRAINT IF EXISTS attendance_status_check;

ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_status_check
  CHECK (status IN ('present', 'cleared'));

-- Existing records are treated as normal present attendance.
UPDATE public.attendance SET status = 'present' WHERE status IS NULL;
