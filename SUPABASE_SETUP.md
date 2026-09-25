# Supabase setup for Smart Attendant

The app uses your own Supabase project for authentication, PostgreSQL and Storage.

## Storage buckets

The included migrations create these buckets when the migrations are applied:

- `attendance-photos` — private attendance snapshots
- `employee-photos` — public employee profile photos (the kiosk needs to display these)

If you are creating the buckets manually instead, create the exact names above. Do not rename them.

## Database migrations

Apply the migrations in `supabase/migrations` to your Supabase project. In particular, the project now needs:

- `employees.join_date` — controls when attendance counting begins for each employee
- `employees.photo_path` — optional profile photo path
- Storage policies for attendance and employee photos

## Environment variables

Set the Supabase values in your local `.env` and in Vercel's Environment Variables. Never put a Supabase service-role key in the browser app.

## Employee photos

Photos are optional. Admins upload them from the employee create/edit dialog. The kiosk and attendance history use the stored profile photo automatically.
