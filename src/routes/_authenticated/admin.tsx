import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  Eraser,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Image as ImageIcon,
  LogOut,
  Monitor,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import logo from "@/assets/printball-logo.png";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  type AttendanceRow,
  type Employee,
  employeePhotoUrl,
  fetchAttendanceMonth,
  fetchEmployees,
  formatDate,
  formatTime,
  removeEmployeePhoto,
  signedPhotoUrl,
  uploadEmployeePhoto,
} from "@/lib/attendance";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "PrintBall Admin" },
      { name: "description", content: "Manage PrintBall staff and attendance." },
    ],
  }),
  component: AdminPanel,
});

const employeeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  age: z.string().trim().optional().or(z.literal("")),
  role: z.string().trim().max(60).optional().or(z.literal("")),
  active: z.boolean(),
  joinDate: z.string().min(1, "Joining date is required"),
});

type EmployeeForm = z.infer<typeof employeeSchema>;
type EditingEmployee = {
  id: string | null;
  form: EmployeeForm;
  photoPath: string | null;
  photoFile: File | null;
  photoPreview: string | null;
  removePhoto: boolean;
};

const todayIndia = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

const emptyForm: EmployeeForm = {
  name: "",
  phone: "",
  address: "",
  age: "",
  role: "",
  active: true,
  joinDate: todayIndia(),
};

function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function avatar(employee: Employee, className = "size-12") {
  const photo = employeePhotoUrl(employee.photo_path);
  return photo ? (
    <img src={photo} alt={employee.name} className={`${className} shrink-0 rounded-2xl object-cover ring-1 ring-border`} />
  ) : (
    <div className={`flex ${className} shrink-0 items-center justify-center rounded-2xl bg-accent font-display text-lg text-accent-foreground`}>
      {employee.name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function AdminPanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const employeesQuery = useQuery({ queryKey: ["employees", "all"], queryFn: () => fetchEmployees(true) });

  const [staffSearch, setStaffSearch] = useState("");
  const [editing, setEditing] = useState<EditingEmployee | null>(null);
  const [deletingEmployee, setDeletingEmployee] = useState<Employee | null>(null);
  const [historyEmployee, setHistoryEmployee] = useState<string | null>(null);
  const [historyMonth, setHistoryMonth] = useState("2026-09");
  const [editingRow, setEditingRow] = useState<AttendanceRow | null>(null);
  const [rowTimes, setRowTimes] = useState({ in: "", out: "" });
  const [photoRow, setPhotoRow] = useState<AttendanceRow | null>(null);
  const [attendanceAction, setAttendanceAction] = useState<{ type: "clear" | "delete"; row: AttendanceRow } | null>(null);

  const historyEmployeeRecord = useMemo(
    () => (employeesQuery.data ?? []).find((employee) => employee.id === historyEmployee) ?? null,
    [employeesQuery.data, historyEmployee],
  );

  const historyQuery = useQuery({
    queryKey: ["attendance", "history", historyEmployee, historyMonth],
    enabled: Boolean(historyEmployee),
    queryFn: () => {
      const [year, month] = historyMonth.split("-").map(Number);
      const next = new Date(year, month, 1);
      return fetchAttendanceMonth(
        historyEmployee!,
        `${historyMonth}-01`,
        `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`,
      );
    },
  });

  const historyCalendar = useMemo(() => {
    const [year, month] = historyMonth.split("-").map(Number);
    const first = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    const today = new Date();
    const todayKeyValue = todayIndia();
    const currentMonth = todayKeyValue.slice(0, 7);
    const attendanceByDate = new Map<string, AttendanceRow>();
    for (const row of historyQuery.data ?? []) attendanceByDate.set(row.work_date, row);

    const workingDays = Array.from({ length: daysInMonth }, (_, index) => {
      const date = new Date(year, month - 1, index + 1);
      return {
        date,
        key: `${historyMonth}-${String(index + 1).padStart(2, "0")}`,
        day: index + 1,
        weekday: date.getDay(),
      };
    }).filter((item) => item.weekday !== 0);

    const weeks: Array<Array<(typeof workingDays)[number] | null>> = [];
    let week: Array<(typeof workingDays)[number] | null> = Array(6).fill(null);
    for (const item of workingDays) {
      const column = item.weekday - 1;
      if (column === 0 && week.some(Boolean)) {
        weeks.push(week);
        week = Array(6).fill(null);
      }
      week[column] = item;
    }
    if (week.some(Boolean)) weeks.push(week);

    const joinDate = historyEmployeeRecord?.join_date ?? "9999-12-31";
    const eligibleWorkingDays = workingDays.filter((item) => item.key >= joinDate && item.key <= todayKeyValue);
    const presentDays = workingDays.filter((item) => {
      const row = attendanceByDate.get(item.key);
      return item.key >= joinDate && item.key <= todayKeyValue && row?.status === "present";
    });
    const clearedDays = workingDays.filter((item) => {
      const row = attendanceByDate.get(item.key);
      return item.key >= joinDate && item.key <= todayKeyValue && row?.status === "cleared";
    });
    const absentDays = eligibleWorkingDays.length - presentDays.length - clearedDays.length;

    return {
      attendanceByDate,
      weeks,
      totalWorkingDays: eligibleWorkingDays.length,
      presentDays,
      clearedDays,
      absentDays,
      monthLabel: first.toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
      canGoPrevious: historyMonth > "2026-09",
      canGoNext: historyMonth < currentMonth,
    };
  }, [historyMonth, historyQuery.data, historyEmployeeRecord]);

  const staff = useMemo(() => {
    const term = staffSearch.trim().toLowerCase();
    const list = employeesQuery.data ?? [];
    if (!term) return list;
    return list.filter(
      (employee) =>
        employee.name.toLowerCase().includes(term) ||
        (employee.role ?? "").toLowerCase().includes(term) ||
        (employee.phone ?? "").includes(term),
    );
  }, [employeesQuery.data, staffSearch]);

  const saveEmployee = useMutation({
    mutationFn: async (state: EditingEmployee) => {
      const parsed = employeeSchema.parse(state.form);
      const ageNumber = parsed.age ? Number(parsed.age) : null;
      if (ageNumber !== null && (Number.isNaN(ageNumber) || ageNumber < 14 || ageNumber > 100)) {
        throw new Error("Age must be a number between 14 and 100");
      }

      const payload = {
        name: parsed.name,
        phone: parsed.phone || null,
        address: parsed.address || null,
        age: ageNumber,
        role: parsed.role || null,
        active: parsed.active,
        join_date: parsed.joinDate,
      };

      let employeeId = state.id;
      let previousPhoto = state.photoPath;
      if (employeeId) {
        const { error } = await supabase.from("employees").update(payload).eq("id", employeeId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("employees").insert(payload).select().single();
        if (error) throw error;
        employeeId = data.id;
      }

      if (state.photoFile && employeeId) {
        const newPath = await uploadEmployeePhoto(employeeId, state.photoFile);
        const { error } = await supabase.from("employees").update({ photo_path: newPath }).eq("id", employeeId);
        if (error) throw error;
        if (previousPhoto && previousPhoto !== newPath) await removeEmployeePhoto(previousPhoto);
        previousPhoto = newPath;
      } else if (state.removePhoto && employeeId && previousPhoto) {
        await removeEmployeePhoto(previousPhoto);
        const { error } = await supabase.from("employees").update({ photo_path: null }).eq("id", employeeId);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      toast.success("Employee saved");
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not save employee"),
  });

  const removeEmployee = useMutation({
    mutationFn: async (employee: Employee) => {
      if (employee.photo_path) await removeEmployeePhoto(employee.photo_path);
      const { error } = await supabase.from("employees").delete().eq("id", employee.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Employee deleted");
      setDeletingEmployee(null);
      await queryClient.invalidateQueries();
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not delete employee"),
  });

  const saveRow = useMutation({
    mutationFn: async () => {
      if (!editingRow) return;
      if (!rowTimes.in) throw new Error("Check-in time is required");
      const checkIn = new Date(rowTimes.in).toISOString();
      const checkOut = rowTimes.out ? new Date(rowTimes.out).toISOString() : null;
      const { error } = editingRow.id
        ? await supabase.from("attendance").update({ check_in_at: checkIn, check_out_at: checkOut, status: "present" }).eq("id", editingRow.id)
        : await supabase.from("attendance").insert({ employee_id: editingRow.employee_id, work_date: editingRow.work_date, check_in_at: checkIn, check_out_at: checkOut, status: "present" });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Attendance updated");
      setEditingRow(null);
      await queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not update attendance"),
  });

  const clearAttendance = useMutation({
    mutationFn: async (row: AttendanceRow) => {
      const photoPaths = [row.check_in_photo, row.check_out_photo].filter(Boolean) as string[];
      if (photoPaths.length) {
        const { error: photoError } = await supabase.storage.from("attendance-photos").remove(photoPaths);
        if (photoError) throw photoError;
      }
      const { error } = await supabase.from("attendance").update({ status: "cleared", check_in_photo: null, check_out_photo: null }).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Attendance cleared for this day");
      setAttendanceAction(null);
      await queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not clear attendance"),
  });

  const deleteAttendance = useMutation({
    mutationFn: async (row: AttendanceRow) => {
      const photoPaths = [row.check_in_photo, row.check_out_photo].filter(Boolean) as string[];
      if (photoPaths.length) {
        const { error: photoError } = await supabase.storage.from("attendance-photos").remove(photoPaths);
        if (photoError) throw photoError;
      }
      const { error } = await supabase.from("attendance").delete().eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Attendance record deleted");
      setAttendanceAction(null);
      await queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not delete attendance"),
  });

  const photosQuery = useQuery({
    queryKey: ["photos", photoRow?.id],
    enabled: Boolean(photoRow),
    queryFn: async () => {
      const [inUrl, outUrl] = await Promise.all([
        photoRow?.check_in_photo ? signedPhotoUrl(photoRow.check_in_photo) : Promise.resolve(null),
        photoRow?.check_out_photo ? signedPhotoUrl(photoRow.check_out_photo) : Promise.resolve(null),
      ]);
      return { inUrl, outUrl };
    },
  });

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  function openEmployee(employee?: Employee) {
    setEditing(
      employee
        ? {
            id: employee.id,
            form: {
              name: employee.name,
              phone: employee.phone ?? "",
              address: employee.address ?? "",
              age: employee.age ? String(employee.age) : "",
              role: employee.role ?? "",
              active: employee.active,
              joinDate: employee.join_date,
            },
            photoPath: employee.photo_path,
            photoFile: null,
            photoPreview: employeePhotoUrl(employee.photo_path),
            removePhoto: false,
          }
        : { id: null, form: { ...emptyForm }, photoPath: null, photoFile: null, photoPreview: null, removePhoto: false },
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#171110]/95 text-white shadow-lg backdrop-blur">
        <div className="mx-auto flex h-[74px] max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
            <span className="flex size-11 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-white/20">
              <img src={logo} alt="PrintBall" className="size-10 object-contain" />
            </span>
            <span className="hidden font-display text-xl tracking-[-0.04em] sm:block">PrintBall</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Button variant="ghost" className="h-10 rounded-xl px-3.5 text-white hover:bg-white/10 hover:text-white" onClick={() => navigate({ to: "/" })}>
              <Monitor className="size-4" />
              <span className="hidden sm:inline">Attendance screen</span>
            </Button>
            <Button variant="ghost" className="h-10 rounded-xl px-3.5 text-white hover:bg-white/10 hover:text-white" onClick={handleSignOut}>
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-9">
        <div className="mb-7 rounded-[1.5rem] border bg-card p-5 shadow-card sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Admin workspace</p>
          <h1 className="mt-1 text-2xl sm:text-3xl">Staff & attendance</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your team and review attendance month by month.</p>
        </div>

        <Tabs defaultValue="staff">
          <TabsList className="h-12 rounded-xl bg-muted/70 p-1">
            <TabsTrigger value="staff" className="h-10 rounded-lg px-5">Staff list</TabsTrigger>
            <TabsTrigger value="history" className="h-10 rounded-lg px-5">Attendance history</TabsTrigger>
          </TabsList>

          <TabsContent value="staff" className="mt-5">
            <section className="rounded-[1.5rem] border bg-card p-4 shadow-card sm:p-6">
              <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-xl">Your staff</h2>
                  <p className="text-sm text-muted-foreground">Employee photos are optional and help identify people at the kiosk.</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative min-w-64 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={staffSearch} onChange={(e) => setStaffSearch(e.target.value)} placeholder="Search staff…" className="h-11 rounded-xl pl-9" />
                  </div>
                  <Button className="h-11 rounded-xl" onClick={() => openEmployee()}><Plus /> Add employee</Button>
                </div>
              </div>

              {staff.length === 0 ? (
                <div className="rounded-2xl border border-dashed py-16 text-center text-muted-foreground">No employees found.</div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {staff.map((employee) => (
                    <article key={employee.id} className="rounded-2xl border bg-background p-4 transition hover:-translate-y-0.5 hover:shadow-md">
                      <div className="flex items-start gap-3">
                        {avatar(employee)}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h3 className="truncate font-semibold">{employee.name}</h3>
                              <p className="truncate text-sm text-muted-foreground">{employee.role || "Staff member"}</p>
                            </div>
                            <Badge variant={employee.active ? "default" : "outline"} className="shrink-0 rounded-full">{employee.active ? "Active" : "Inactive"}</Badge>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-xl bg-muted/60 p-2.5"><span className="block text-muted-foreground">Joining date</span><strong className="mt-0.5 block">{formatDate(employee.join_date)}</strong></div>
                        <div className="rounded-xl bg-muted/60 p-2.5"><span className="block text-muted-foreground">Phone</span><strong className="mt-0.5 block truncate">{employee.phone || "Not added"}</strong></div>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button variant="outline" className="flex-1 rounded-xl" onClick={() => openEmployee(employee)}><Pencil /> Edit</Button>
                        <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => setDeletingEmployee(employee)}><Trash2 className="text-destructive" /></Button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </TabsContent>

          <TabsContent value="history" className="mt-5">
            <div className="grid gap-5 lg:grid-cols-[290px_minmax(0,1fr)]">
              <section className="rounded-[1.5rem] border bg-card p-4 shadow-card">
                <div className="mb-4 flex items-center gap-3 px-2">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground"><UserRound className="size-5" /></div>
                  <div><h2 className="font-semibold">Employees</h2><p className="text-xs text-muted-foreground">Select an employee</p></div>
                </div>
                <div className="max-h-[680px] space-y-2 overflow-y-auto pr-1">
                  {(employeesQuery.data ?? []).map((employee) => {
                    const selected = historyEmployee === employee.id;
                    return (
                      <button key={employee.id} type="button" onClick={() => setHistoryEmployee(employee.id)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${selected ? "border-primary bg-primary/5 shadow-sm" : "border-transparent hover:border-border hover:bg-muted/60"}`}>
                        {avatar(employee, "size-11")}
                        <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{employee.name}</span><span className="block truncate text-xs text-muted-foreground">{employee.role || "Staff"}</span></span>
                        {selected && <span className="size-2 rounded-full bg-primary" />}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="min-w-0 rounded-[1.5rem] border bg-card p-4 shadow-card sm:p-6">
                {!historyEmployee ? (
                  <div className="flex min-h-[480px] flex-col items-center justify-center text-center">
                    <div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-accent text-accent-foreground"><CalendarDays className="size-7" /></div>
                    <h2 className="text-2xl">Choose an employee</h2>
                    <p className="mt-2 max-w-sm text-sm text-muted-foreground">Select a person from the left to open their monthly attendance calendar.</p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        {historyEmployeeRecord && avatar(historyEmployeeRecord, "size-14")}
                        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Attendance</p><h2 className="text-2xl">{historyEmployeeRecord?.name}</h2><p className="text-sm text-muted-foreground">Joined {historyEmployeeRecord ? formatDate(historyEmployeeRecord.join_date) : "—"}</p></div>
                      </div>
                      <div className="flex items-center gap-1 rounded-xl border bg-background p-1">
                        <Button variant="ghost" size="icon" disabled={!historyCalendar.canGoPrevious} onClick={() => { const [year, month] = historyMonth.split("-").map(Number); const date = new Date(year, month - 2, 1); setHistoryMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`); }}><ChevronLeft /></Button>
                        <span className="min-w-36 text-center text-sm font-semibold">{historyCalendar.monthLabel}</span>
                        <Button variant="ghost" size="icon" disabled={!historyCalendar.canGoNext} onClick={() => { const [year, month] = historyMonth.split("-").map(Number); const date = new Date(year, month, 1); setHistoryMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`); }}><ChevronRight /></Button>
                      </div>
                    </div>

                    <div className="grid gap-3 py-5 sm:grid-cols-4">
                      <div className="rounded-2xl border bg-success/5 p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Present</p><p className="mt-1 text-3xl font-display text-success">{historyCalendar.presentDays.length}</p></div>
                      <div className="rounded-2xl border bg-destructive/5 p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Absent</p><p className="mt-1 text-3xl font-display text-destructive">{historyCalendar.absentDays}</p></div>
                      <div className="rounded-2xl border bg-muted/50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Cleared</p><p className="mt-1 text-3xl font-display text-muted-foreground">{historyCalendar.clearedDays.length}</p></div>
                      <div className="rounded-2xl border bg-muted/50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Working days</p><p className="mt-1 text-3xl font-display">{historyCalendar.presentDays.length} / {historyCalendar.totalWorkingDays}</p></div>
                    </div>

                    <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-2"><span className="size-3 rounded bg-success" /> Present · click for photos</span>
                      <span className="inline-flex items-center gap-2"><span className="size-3 rounded bg-destructive" /> Absent · click to add</span>
                      <span className="inline-flex items-center gap-2"><span className="size-3 rounded border bg-background" /> Cleared</span>
                      <span className="inline-flex items-center gap-2"><Pencil className="size-3" /> Edit</span>
                      <span>Sundays are excluded.</span>
                    </div>

                    <div className="overflow-hidden rounded-2xl border">
                      <div className="w-full min-w-0">
                        <div className="grid grid-cols-6 border-b bg-muted/50">
                          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day} className="px-3 py-3 text-center text-xs font-bold uppercase tracking-wide text-muted-foreground">{day}</div>)}
                        </div>
                        {historyCalendar.weeks.map((week, weekIndex) => (
                          <div key={weekIndex} className="grid grid-cols-6 divide-x border-b last:border-b-0">
                            {week.map((item, index) => {
                              if (!item) return <div key={index} className="min-h-28 bg-muted/10" />;
                              const row = historyCalendar.attendanceByDate.get(item.key);
                              const notJoined = item.key < (historyEmployeeRecord?.join_date ?? "9999-12-31");
                              const isFuture = item.key > todayIndia();
                              const cleared = row?.status === "cleared";
                              const present = row?.status === "present" && !notJoined;
                              return (
                                <div key={item.key} className="min-h-28 min-w-0 p-1.5 sm:p-2">
                                  {notJoined ? (
                                    <div className="flex h-full min-h-24 flex-col rounded-xl border border-dashed bg-muted/20 p-2 text-muted-foreground"><span className="font-display text-xl">{item.day}</span><span className="mt-auto text-[10px]">Not joined</span></div>
                                  ) : cleared ? (
                                    <div className="flex h-full min-h-24 flex-col rounded-xl border border-border bg-background p-2.5">
                                      <div className="flex items-center justify-between gap-1"><span className="font-display text-xl text-muted-foreground">{item.day}</span><span className="rounded-full border px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">—</span></div>
                                      <span className="mt-auto text-[11px] font-semibold text-muted-foreground">Cleared</span>
                                      <div className="mt-2 flex items-center gap-1.5">
                                        <button type="button" className="inline-flex h-7 flex-1 items-center justify-center rounded-lg border bg-background px-2 text-[10px] font-semibold text-primary transition hover:bg-primary/5" onClick={() => { setEditingRow(row!); setRowTimes({ in: toLocalInput(row!.check_in_at), out: toLocalInput(row!.check_out_at) }); }}>Mark present</button>
                                        <button type="button" title="Delete record" aria-label="Delete record" className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg border text-destructive transition hover:bg-destructive/5" onClick={() => setAttendanceAction({ type: "delete", row: row! })}><Trash2 className="size-3.5" /></button>
                                      </div>
                                    </div>
                                  ) : present ? (
                                    <div className="relative flex h-full min-h-24 min-w-0 flex-col rounded-xl border border-success/30 bg-success/10 p-2.5 pr-10 transition hover:bg-success/15">
                                      <button type="button" onClick={() => setPhotoRow(row!)} className="flex min-w-0 items-center gap-1.5 text-left">
                                        <span className="font-display text-xl leading-none text-success">{item.day}</span>
                                        <span className="rounded-full bg-success px-1.5 py-0.5 text-[9px] font-bold text-success-foreground">P</span>
                                      </button>
                                      <button title="Edit attendance" aria-label="Edit attendance" type="button" className="absolute right-1.5 top-1.5 inline-flex size-7 items-center justify-center rounded-lg border border-success/20 bg-background/95 text-foreground shadow-sm transition hover:bg-background" onClick={() => { setEditingRow(row!); setRowTimes({ in: toLocalInput(row!.check_in_at), out: toLocalInput(row!.check_out_at) }); }}><Pencil className="size-3.5" /></button>
                                      <button title="Clear day" aria-label="Clear day" type="button" className="absolute right-1.5 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-lg border border-success/20 bg-background/95 text-muted-foreground shadow-sm transition hover:bg-background hover:text-foreground" onClick={() => setAttendanceAction({ type: "clear", row: row! })}><Eraser className="size-3.5" /></button>
                                      <button title="Delete record" aria-label="Delete record" type="button" className="absolute bottom-1.5 right-1.5 inline-flex size-7 items-center justify-center rounded-lg border border-destructive/20 bg-background/95 text-destructive shadow-sm transition hover:bg-destructive/5" onClick={() => setAttendanceAction({ type: "delete", row: row! })}><Trash2 className="size-3.5" /></button>
                                      <button type="button" onClick={() => setPhotoRow(row!)} className="mt-auto min-w-0 text-left">
                                        <span className="block truncate text-[11px] font-semibold text-success">Present</span>
                                        <span className="block truncate text-[10px] text-muted-foreground">IN {formatTime(row!.check_in_at)}</span>
                                        <span className="block truncate text-[10px] text-muted-foreground">OUT {formatTime(row!.check_out_at)}</span>
                                      </button>
                                    </div>
                                  ) : (
                                    <div className={`flex h-full min-h-24 flex-col rounded-xl border p-2 ${isFuture ? "border-border bg-muted/20 text-muted-foreground" : "border-destructive/25 bg-destructive/10"}`}>
                                      <div className="flex items-center justify-between"><span className="font-display text-xl">{item.day}</span>{!isFuture && <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[9px] font-bold text-destructive-foreground">A</span>}</div>
                                      <span className={`mt-auto text-[11px] font-semibold ${isFuture ? "text-muted-foreground" : "text-destructive"}`}>{isFuture ? "Upcoming" : "Absent"}</span>
                                      {!isFuture && <button type="button" className="mt-1 text-left text-[10px] font-semibold text-primary hover:underline" onClick={() => { setEditingRow({ id: "", employee_id: historyEmployee!, work_date: item.key, check_in_at: new Date(`${item.key}T09:00:00+05:30`).toISOString(), check_out_at: null, check_in_photo: null, check_out_photo: null, status: "present" }); setRowTimes({ in: `${item.key}T09:00`, out: "" }); }}>+ Mark present</button>}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </section>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit employee" : "Add employee"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-5">
              <div className="flex flex-col gap-4 rounded-2xl border bg-muted/30 p-4 sm:flex-row sm:items-center">
                {editing.photoPreview ? <img src={editing.photoPreview} alt="Employee preview" className="size-24 rounded-2xl object-cover ring-1 ring-border" /> : <div className="flex size-24 items-center justify-center rounded-2xl bg-accent text-accent-foreground"><UserRound className="size-8" /></div>}
                <div className="flex-1"><p className="font-semibold">Employee photo <span className="font-normal text-muted-foreground">(optional)</span></p><p className="mt-1 text-xs text-muted-foreground">JPG, PNG or WebP. This photo appears on the attendance screen and history.</p><div className="mt-3 flex flex-wrap gap-2"><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"><Upload className="size-4" /> Upload photo<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 5 * 1024 * 1024) { toast.error("Photo must be 5 MB or smaller"); return; } setEditing({ ...editing, photoFile: file, photoPreview: URL.createObjectURL(file), removePhoto: false }); }} /></label>{editing.photoPreview && <Button type="button" variant="outline" className="rounded-xl" onClick={() => setEditing({ ...editing, photoFile: null, photoPreview: null, removePhoto: Boolean(editing.photoPath) })}><X /> Remove</Button>}</div></div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2"><Label htmlFor="name">Full name</Label><Input id="name" value={editing.form.name} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, name: e.target.value } })} placeholder="Employee name" /></div>
                <div className="space-y-2"><Label htmlFor="role">Role</Label><Input id="role" value={editing.form.role} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, role: e.target.value } })} placeholder="Designer, operator…" /></div>
                <div className="space-y-2"><Label htmlFor="phone">Phone</Label><Input id="phone" value={editing.form.phone} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, phone: e.target.value } })} /></div>
                <div className="space-y-2"><Label htmlFor="age">Age</Label><Input id="age" inputMode="numeric" value={editing.form.age} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, age: e.target.value } })} /></div>
                <div className="space-y-2"><Label htmlFor="joinDate">Joining date</Label><Input id="joinDate" type="date" value={editing.form.joinDate} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, joinDate: e.target.value } })} /><p className="text-xs text-muted-foreground">Attendance before this date is left blank and excluded from totals.</p></div>
                <div className="space-y-2 sm:col-span-2"><Label htmlFor="address">Address</Label><Textarea id="address" value={editing.form.address} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, address: e.target.value } })} /></div>
              </div>
              <div className="flex items-center justify-between rounded-2xl border p-4"><div><p className="font-medium">Active employee</p><p className="text-xs text-muted-foreground">Inactive employees are hidden from the attendance screen.</p></div><Switch checked={editing.form.active} onCheckedChange={(checked) => setEditing({ ...editing, form: { ...editing.form, active: checked } })} /></div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button disabled={saveEmployee.isPending} onClick={() => editing && saveEmployee.mutate(editing)}>{saveEmployee.isPending ? "Saving…" : "Save employee"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editingRow !== null} onOpenChange={(open) => !open && setEditingRow(null)}>
        <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{editingRow?.id ? "Edit attendance" : "Add attendance"}</DialogTitle></DialogHeader><div className="space-y-4"><div className="rounded-xl bg-muted/50 p-3 text-sm"><p className="font-medium">{historyEmployeeRecord?.name}</p><p className="text-xs text-muted-foreground">{editingRow ? formatDate(editingRow.work_date) : ""}</p></div><div className="space-y-2"><Label htmlFor="check-in">Check in</Label><Input id="check-in" type="datetime-local" value={rowTimes.in} onChange={(e) => setRowTimes({ ...rowTimes, in: e.target.value })} /></div><div className="space-y-2"><Label htmlFor="check-out">Check out</Label><Input id="check-out" type="datetime-local" value={rowTimes.out} onChange={(e) => setRowTimes({ ...rowTimes, out: e.target.value })} /></div></div><DialogFooter><Button variant="outline" onClick={() => setEditingRow(null)}>Cancel</Button><Button disabled={saveRow.isPending} onClick={() => saveRow.mutate()}>{saveRow.isPending ? "Saving…" : "Save attendance"}</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={photoRow !== null} onOpenChange={(open) => !open && setPhotoRow(null)}>
        <DialogContent className="max-h-[94vh] max-w-6xl overflow-y-auto"><DialogHeader><DialogTitle>{photoRow ? `${historyEmployeeRecord?.name ?? "Employee"} · ${formatDate(photoRow.work_date)}` : "Attendance photos"}</DialogTitle></DialogHeader>{photosQuery.isLoading ? <p className="py-12 text-center text-sm text-muted-foreground">Loading photos…</p> : <div className="grid gap-6 lg:grid-cols-2">{([['Check in', photosQuery.data?.inUrl, photoRow?.check_in_at], ['Check out', photosQuery.data?.outUrl, photoRow?.check_out_at]] as const).map(([label, url, time]) => <figure key={label} className="overflow-hidden rounded-2xl border bg-muted/20"><div className="flex items-center justify-between border-b bg-card px-4 py-3"><figcaption className="font-semibold">{label}</figcaption><span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><Clock3 className="size-4" /> {formatTime(time ?? null)}</span></div>{url ? <div className="flex min-h-[360px] items-center justify-center bg-black/5 p-3"><img src={url} alt={`${label} photo`} className="max-h-[70vh] w-full rounded-xl object-contain" /></div> : <div className="flex min-h-[360px] items-center justify-center text-sm text-muted-foreground">No {label.toLowerCase()} photo was captured.</div>}</figure>)}</div>}</DialogContent>
      </Dialog>

      <AlertDialog open={attendanceAction !== null} onOpenChange={(open) => !open && setAttendanceAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{attendanceAction?.type === "clear" ? "Clear this attendance day?" : "Delete this attendance record?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {attendanceAction?.type === "clear"
                ? `This will make ${formatDate(attendanceAction.row.work_date)} a neutral blank day. It will not be counted as absent, and the captured attendance photos will be removed.`
                : `This permanently removes the attendance record for ${formatDate(attendanceAction?.row.work_date ?? "")} . If you want a neutral blank day instead, use Clear.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={attendanceAction?.type === "delete" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
              onClick={() => attendanceAction && (attendanceAction.type === "clear" ? clearAttendance.mutate(attendanceAction.row) : deleteAttendance.mutate(attendanceAction.row))}
            >
              {attendanceAction?.type === "clear" ? "Clear day" : "Delete record"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deletingEmployee !== null} onOpenChange={(open) => !open && setDeletingEmployee(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {deletingEmployee?.name}?</AlertDialogTitle><AlertDialogDescription>This removes the employee and their attendance history. If you want to keep the records, mark them inactive instead.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deletingEmployee && removeEmployee.mutate(deletingEmployee)}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}
