-- PrintBall payroll V5: employee codes, flexible grace windows and holiday ranges.

-- 1) Stable human-friendly employee IDs.
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS employee_code text;

CREATE SEQUENCE IF NOT EXISTS public.employee_code_seq START WITH 1;

WITH numbered AS (
  SELECT id, 'PB-' || lpad(row_number() OVER (ORDER BY created_at, id)::text, 4, '0') AS code
  FROM public.employees
  WHERE employee_code IS NULL OR btrim(employee_code) = ''
)
UPDATE public.employees e
SET employee_code = numbered.code
FROM numbered
WHERE e.id = numbered.id;

SELECT setval(
  'public.employee_code_seq',
  COALESCE((SELECT max(regexp_replace(employee_code, '[^0-9]', '', 'g')::bigint) FROM public.employees WHERE employee_code ~ '[0-9]+$'), 0),
  true
);

CREATE OR REPLACE FUNCTION public.assign_employee_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.employee_code IS NULL OR btrim(NEW.employee_code) = '' THEN
    NEW.employee_code := 'PB-' || lpad(nextval('public.employee_code_seq')::text, 4, '0');
  ELSE
    NEW.employee_code := upper(btrim(NEW.employee_code));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employees_assign_code ON public.employees;
CREATE TRIGGER employees_assign_code
BEFORE INSERT ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.assign_employee_code();

CREATE UNIQUE INDEX IF NOT EXISTS employees_employee_code_key ON public.employees(employee_code);
ALTER TABLE public.employees ALTER COLUMN employee_code SET NOT NULL;

-- 2) Replace the single grace period with independent start/end grace windows.
ALTER TABLE public.payroll_settings DROP COLUMN IF EXISTS grace_minutes;
ALTER TABLE public.payroll_settings
  ADD COLUMN IF NOT EXISTS grace_start_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grace_end_minutes integer NOT NULL DEFAULT 0;

ALTER TABLE public.payroll_settings
  DROP CONSTRAINT IF EXISTS payroll_settings_grace_start_minutes_check,
  DROP CONSTRAINT IF EXISTS payroll_settings_grace_end_minutes_check;
ALTER TABLE public.payroll_settings
  ADD CONSTRAINT payroll_settings_grace_start_minutes_check CHECK (grace_start_minutes >= 0 AND grace_start_minutes <= 720),
  ADD CONSTRAINT payroll_settings_grace_end_minutes_check CHECK (grace_end_minutes >= 0 AND grace_end_minutes <= 720);

-- 3) Holidays can cover a range instead of only one day.
ALTER TABLE public.holidays DROP CONSTRAINT IF EXISTS holidays_holiday_date_key;
ALTER TABLE public.holidays
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date;

UPDATE public.holidays
SET start_date = COALESCE(start_date, holiday_date),
    end_date = COALESCE(end_date, holiday_date)
WHERE start_date IS NULL OR end_date IS NULL;

ALTER TABLE public.holidays
  ALTER COLUMN start_date SET NOT NULL,
  ALTER COLUMN end_date SET NOT NULL;

ALTER TABLE public.holidays
  DROP CONSTRAINT IF EXISTS holidays_date_range_check;
ALTER TABLE public.holidays
  ADD CONSTRAINT holidays_date_range_check CHECK (end_date >= start_date);

CREATE INDEX IF NOT EXISTS holidays_date_range_idx ON public.holidays(start_date, end_date);

GRANT USAGE, SELECT ON SEQUENCE public.employee_code_seq TO authenticated;
GRANT SELECT ON public.employees TO anon, authenticated;
