# PrintBall Payroll V6 rate model

## Stable monthly rate

The monthly salary is now distributed over **calendar days**, not the number of scheduled working days.

- 30-day month: `monthly salary / 30`
- 31-day month: `monthly salary / 31`
- February: `monthly salary / 28`
- Leap-year February: `monthly salary / 29`

Example for ₹10,000 in a 30-day month:

- Daily rate = ₹10,000 / 30 = ₹333.33
- For a 9-hour (540-minute) office day, minute rate ≈ ₹0.62/minute
- 20 late minutes therefore deduct about ₹12.35 before any configured grace period.
- 60 Sunday overtime minutes at 1× add about ₹37.04.

The daily and minute rates stay fixed for the selected employee/month. Holidays, Sundays and the number of working weekdays do **not** change the denominator.

## Joining mid-month

For the current month, salary accrues only from the joining date through today. For a completed historical month, it accrues from the joining date through month-end.

Example: ₹10,000 salary, 30-day September, employee joins September 25 and today is September 25:

`₹10,000 / 30 = ₹333.33` accrued for that day — not the full ₹10,000.

As the month progresses, each additional calendar day adds the same ₹333.33 before attendance deductions.

## Attendance deductions

- Normal working-day absence: one daily rate deducted.
- Half day: half a daily rate deducted, plus any applicable late deduction within the remaining daily-rate cap.
- Late: late minutes after the start grace period × fixed minute rate.
- Unpaid leave: one daily rate deducted.
- Paid leave: no deduction.
- Cleared day: no deduction.
- Holiday: no deduction.
- Weekly Sunday: no deduction when nobody works.

## Sunday overtime

Sunday is a paid weekly holiday by default.

If Sunday work is needed, enable **Sunday OT** in Office Policy. Any actual Sunday attendance is treated as overtime for **every worked minute**, paid using:

`Sunday worked minutes × fixed minute rate × overtime multiplier`

A missing Sunday never creates an absence deduction.

## Overtime on normal days

Normal weekday overtime begins after:

`office closing time + end grace`

and is paid minute-by-minute using the same fixed minute rate multiplied by the configured overtime multiplier.

## February / leap years

The calendar-day denominator is computed from the actual month, so February automatically uses 28 days in a normal year and 29 days in a leap year.

## Historical data

Attendance, leave and holiday records remain in Supabase. Payroll is recalculated from those records whenever the selected month or policy changes, so old months can still be reviewed and printed.
