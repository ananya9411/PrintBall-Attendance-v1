ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS join_date date;

UPDATE public.employees
SET join_date = ((created_at AT TIME ZONE 'Asia/Kolkata')::date)
WHERE join_date IS NULL;

ALTER TABLE public.employees
  ALTER COLUMN join_date SET DEFAULT ((now() AT TIME ZONE 'Asia/Kolkata')::date),
  ALTER COLUMN join_date SET NOT NULL;
