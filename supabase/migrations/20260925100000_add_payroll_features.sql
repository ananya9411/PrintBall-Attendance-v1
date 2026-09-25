-- Payroll, holidays, leaves and office policy for PrintBall Attendance.
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS monthly_salary numeric(12,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.payroll_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  office_start time NOT NULL DEFAULT '10:00',
  office_end time NOT NULL DEFAULT '19:00',
  grace_minutes integer NOT NULL DEFAULT 0 CHECK (grace_minutes >= 0 AND grace_minutes <= 180),
  half_day_minutes integer NOT NULL DEFAULT 270 CHECK (half_day_minutes > 0 AND half_day_minutes <= 1440),
  overtime_multiplier numeric(6,2) NOT NULL DEFAULT 1.00 CHECK (overtime_multiplier >= 0),
  working_days smallint[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6]::smallint[],
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.payroll_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
GRANT SELECT ON public.payroll_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.payroll_settings TO authenticated;
ALTER TABLE public.payroll_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read payroll settings" ON public.payroll_settings;
CREATE POLICY "Anyone can read payroll settings" ON public.payroll_settings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage payroll settings" ON public.payroll_settings;
CREATE POLICY "Admins manage payroll settings" ON public.payroll_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date date NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.holidays TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.holidays TO authenticated;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read holidays" ON public.holidays;
CREATE POLICY "Anyone can read holidays" ON public.holidays FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage holidays" ON public.holidays;
CREATE POLICY "Admins manage holidays" ON public.holidays FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.employee_leaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  leave_type text NOT NULL CHECK (leave_type IN ('paid', 'unpaid')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS employee_leaves_employee_dates_idx ON public.employee_leaves (employee_id, start_date, end_date);
GRANT SELECT ON public.employee_leaves TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.employee_leaves TO authenticated;
ALTER TABLE public.employee_leaves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read employee leaves" ON public.employee_leaves;
CREATE POLICY "Anyone can read employee leaves" ON public.employee_leaves FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage employee leaves" ON public.employee_leaves;
CREATE POLICY "Admins manage employee leaves" ON public.employee_leaves FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.set_payroll_settings_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS payroll_settings_updated_at ON public.payroll_settings;
CREATE TRIGGER payroll_settings_updated_at BEFORE UPDATE ON public.payroll_settings
FOR EACH ROW EXECUTE FUNCTION public.set_payroll_settings_updated_at();
