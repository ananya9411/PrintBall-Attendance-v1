# Attendance behavior and testing

## Check-in/check-out reset

The kiosk is date-based using `Asia/Kolkata`. A person's attendance is loaded with today's `work_date`, so an attendance record from yesterday does not make them present today. After midnight IST, the employee card becomes **Not checked in** again and a new check-in/check-out can be recorded.

### Test the reset immediately

You do not need to wait until midnight.

1. Mark an employee present and, if desired, check them out.
2. Open Supabase SQL Editor.
3. Find today's attendance row:

```sql
select id, employee_id, work_date, check_in_at, check_out_at, status
from public.attendance
order by created_at desc;
```

4. Temporarily move that test row to yesterday (use the same employee):

```sql
update public.attendance
set work_date = ((now() at time zone 'Asia/Kolkata')::date - 1)
where id = 'PUT_TEST_ROW_ID_HERE';
```

5. Refresh the attendance screen. That employee should now show **Not checked in** for today.
6. Mark them present again. A new attendance row for today's date should be created.

You can then leave the test row as yesterday or delete it from the admin calendar.

## Admin attendance actions

The admin calendar supports:

- **Edit** — change check-in/check-out times.
- **Clear** — keeps a neutral record for that date, removes its captured attendance photos, and displays the day as a white/blank **Cleared** cell. A cleared day is not counted as Absent.
- **Delete** — permanently deletes the attendance row and its captured photos. A deleted past working day becomes **Absent** because there is no attendance record.
- **Mark present** — adds/restores attendance for an absent or cleared working day.

The `status` column is added by migration `20260924140000_add_attendance_status.sql`.
