import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CalendarPlus,
  Eraser,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Gift,
  LogOut,
  Monitor,
  Pencil,
  Plus,
  Search,
  Settings2,
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  calculateSalary,
  DEFAULT_PAYROLL_SETTINGS,
  money,
  minutesLabel,
  monthBounds,
  type Holiday,
  type Leave,
  type PayrollSettings,
  getIndiaNationalHolidays,
} from "@/lib/payroll";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
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
  employeeCode: z.string().trim().max(30).optional().or(z.literal("")),
  joinDate: z.string().min(1, "Joining date is required"),
  monthlySalary: z.string().min(1, "Monthly salary is required"),
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
  employeeCode: "",
  joinDate: todayIndia(),
  monthlySalary: "0",
};

function pad(n: number) { return String(n).padStart(2, "0"); }

function time24ToParts(value: string) {
  const [h, m] = value.slice(0, 5).split(":").map(Number);
  const hour = h % 12 || 12;
  return { hour: String(hour), minute: pad(m), period: h >= 12 ? "PM" : "AM" };
}

function timePartsTo24(hour: string, minute: string, period: string) {
  let h = Number(hour) % 12;
  if (period === "PM") h += 12;
  return `${pad(h)}:${pad(Number(minute))}`;
}

function indiaParts(value: string | null, fallbackDate: string, fallbackTime: string) {
  if (!value) {
    const parts = time24ToParts(fallbackTime);
    return { date: fallbackDate, ...parts };
  }
  const date = new Date(value);
  const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(date);
  const time = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(date);
  const hour = time.find((p) => p.type === "hour")?.value ?? "12";
  const minute = time.find((p) => p.type === "minute")?.value ?? "00";
  const period = time.find((p) => p.type === "dayPeriod")?.value?.toUpperCase() === "PM" ? "PM" : "AM";
  return { date: dateKey, hour, minute, period };
}

function partsToIso(date: string, hour: string, minute: string, period: string) {
  const time24 = timePartsTo24(hour, minute, period);
  return new Date(`${date}T${time24}:00+05:30`).toISOString();
}

function Time12Input({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const parts = time24ToParts(value || "10:00");
  return (
    <div className="grid grid-cols-[1fr_1fr_1.1fr] gap-2">
      <select aria-label="Hour" value={parts.hour} onChange={(e) => onChange(timePartsTo24(e.target.value, parts.minute, parts.period))} className="h-10 rounded-xl border bg-background px-3 text-sm">
        {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((h) => <option key={h}>{h}</option>)}
      </select>
      <select aria-label="Minute" value={parts.minute} onChange={(e) => onChange(timePartsTo24(parts.hour, e.target.value, parts.period))} className="h-10 rounded-xl border bg-background px-3 text-sm">
        {Array.from({ length: 60 }, (_, i) => pad(i)).map((m) => <option key={m}>{m}</option>)}
      </select>
      <select aria-label="AM or PM" value={parts.period} onChange={(e) => onChange(timePartsTo24(parts.hour, parts.minute, e.target.value))} className="h-10 rounded-xl border bg-background px-3 text-sm">
        <option>AM</option><option>PM</option>
      </select>
    </div>
  );
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
  const [staffSearch, setStaffSearch] = useState("");
  const [editing, setEditing] = useState<EditingEmployee | null>(null);
  const [deletingEmployee, setDeletingEmployee] = useState<Employee | null>(null);
  const [historyEmployee, setHistoryEmployee] = useState<string | null>(null);
  const [historySearch, setHistorySearch] = useState("");
  const [historyMonth, setHistoryMonth] = useState(todayIndia().slice(0, 7));
  const [editingRow, setEditingRow] = useState<AttendanceRow | null>(null);
  const [rowTimes, setRowTimes] = useState({ inDate: "", inHour: "10", inMinute: "00", inPeriod: "AM", outDate: "", outHour: "07", outMinute: "00", outPeriod: "PM" });
  const [photoRow, setPhotoRow] = useState<AttendanceRow | null>(null);
  const [attendanceAction, setAttendanceAction] = useState<{ type: "clear" | "delete"; row: AttendanceRow } | null>(null);
  const [salaryEmployee, setSalaryEmployee] = useState<string | null>(null);
  const [salarySearch, setSalarySearch] = useState("");
  const [salaryMonth, setSalaryMonth] = useState(todayIndia().slice(0, 7));
  const [receipt, setReceipt] = useState<ReturnType<typeof calculateSalary> | null>(null);
  const [holidayDialog, setHolidayDialog] = useState(false);
  const [leaveDialog, setLeaveDialog] = useState(false);
  const [holidayForm, setHolidayForm] = useState({ startDate: todayIndia(), endDate: todayIndia(), name: "" });
  const [leaveForm, setLeaveForm] = useState({ employeeId: "", startDate: todayIndia(), endDate: todayIndia(), type: "paid" as "paid" | "unpaid", reason: "" });
  const [payrollSettings, setPayrollSettings] = useState<PayrollSettings>(DEFAULT_PAYROLL_SETTINGS);

  const employeesQuery = useQuery({ queryKey: ["employees", "all"], queryFn: () => fetchEmployees(true) });
  const settingsQuery = useQuery({ queryKey: ["payroll", "settings"], queryFn: async () => { const { data, error } = await supabase.from("payroll_settings").select("*").eq("id", 1).maybeSingle(); if (error) throw error; return (data as PayrollSettings | null) ?? DEFAULT_PAYROLL_SETTINGS; } });
  const holidaysQuery = useQuery({ queryKey: ["payroll", "holidays"], queryFn: async () => { const { data, error } = await supabase.from("holidays").select("*").order("holiday_date", { ascending: true }); if (error) throw error; return (data ?? []) as Holiday[]; } });
  const leavesQuery = useQuery({ queryKey: ["payroll", "leaves"], queryFn: async () => { const { data, error } = await supabase.from("employee_leaves").select("*").order("start_date", { ascending: false }); if (error) throw error; return (data ?? []) as Leave[]; } });
  const salaryAttendanceQuery = useQuery({ queryKey: ["payroll", "attendance", salaryMonth], queryFn: async () => { const { start, end } = monthBounds(salaryMonth); const { data, error } = await supabase.from("attendance").select("*").gte("work_date", start).lt("work_date", end); if (error) throw error; return (data ?? []) as AttendanceRow[]; } });

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

  const combinedHistoryHolidays = useMemo(() => [
    ...(holidaysQuery.data ?? []),
    ...getIndiaNationalHolidays(Number(historyMonth.slice(0, 4))),
  ], [holidaysQuery.data, historyMonth]);

  const historyCalendar = useMemo(() => {
    const [year, month] = historyMonth.split("-").map(Number);
    const first = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    const todayKeyValue = todayIndia();
    const attendanceByDate = new Map<string, AttendanceRow>();
    for (const row of historyQuery.data ?? []) attendanceByDate.set(row.work_date, row);
    const holidayMap = new Map<string, string>();
    for (const holiday of combinedHistoryHolidays) {
      const start = holiday.start_date ?? holiday.holiday_date;
      const end = holiday.end_date ?? holiday.holiday_date;
      for (let day = 1; day <= daysInMonth; day++) {
        const key = `${historyMonth}-${pad(day)}`;
        if (start <= key && end >= key) holidayMap.set(key, holiday.name);
      }
    }
    const days = Array.from({ length: daysInMonth }, (_, index) => {
      const date = new Date(year, month - 1, index + 1);
      return { date, key: `${historyMonth}-${pad(index + 1)}`, day: index + 1, weekday: date.getDay() };
    });
    const weeks: Array<Array<(typeof days)[number] | null>> = [];
    let week: Array<(typeof days)[number] | null> = Array(7).fill(null);
    for (const item of days) {
      const column = item.weekday;
      if (column === 0 && week.some(Boolean)) { weeks.push(week); week = Array(7).fill(null); }
      week[column] = item;
    }
    if (week.some(Boolean)) weeks.push(week);

    const joinDate = historyEmployeeRecord?.join_date ?? "9999-12-31";
    // Sunday is a weekly holiday by default. Even when Sunday overtime is
    // enabled in the policy, a missing Sunday must never become an absence.
    const isNormalWorking = (item: (typeof days)[number]) => item.weekday !== 0 && payrollSettings.working_days.includes(item.weekday);
    const isSundayOvertime = (item: (typeof days)[number]) => item.weekday === 0 && payrollSettings.working_days.includes(0);
    const eligible = days.filter((item) => item.key >= joinDate && item.key <= todayKeyValue && isNormalWorking(item) && !holidayMap.has(item.key));
    const presentDays = [
      ...eligible.filter((item) => attendanceByDate.get(item.key)?.status === "present"),
      ...days.filter((item) => item.key >= joinDate && item.key <= todayKeyValue && isSundayOvertime(item) && attendanceByDate.get(item.key)?.status === "present"),
    ];
    const clearedDays = eligible.filter((item) => attendanceByDate.get(item.key)?.status === "cleared");
    const absentDays = Math.max(0, eligible.length - presentDays.filter((item) => isNormalWorking(item)).length - clearedDays.length);
    const holidayDays = days.filter((item) => item.key >= joinDate && item.key <= todayKeyValue && holidayMap.has(item.key)).length;
    const offDays = days.filter((item) => item.key >= joinDate && item.key <= todayKeyValue && !isNormalWorking(item) && !holidayMap.has(item.key)).length;
    return {
      attendanceByDate, holidayMap, weeks, totalWorkingDays: eligible.length, presentDays, clearedDays, absentDays, holidayDays, offDays,
      monthLabel: first.toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
      canGoNext: historyMonth < todayKeyValue.slice(0, 7),
    };
  }, [historyMonth, historyQuery.data, historyEmployeeRecord, payrollSettings.working_days, combinedHistoryHolidays]);


  const staff = useMemo(() => {
    const term = staffSearch.trim().toLowerCase();
    const list = employeesQuery.data ?? [];
    if (!term) return list;
    return list.filter((employee) => (employee.employee_code ?? "").toLowerCase().includes(term) || employee.name.toLowerCase().includes(term) || (employee.role ?? "").toLowerCase().includes(term) || (employee.phone ?? "").includes(term));
  }, [employeesQuery.data, staffSearch]);

  const historyStaff = useMemo(() => {
    const term = historySearch.trim().toLowerCase();
    const list = employeesQuery.data ?? [];
    if (!term) return list;
    return list.filter((employee) => (employee.employee_code ?? "").toLowerCase().includes(term) || employee.name.toLowerCase().includes(term));
  }, [employeesQuery.data, historySearch]);


  const saveEmployee = useMutation({
    mutationFn: async (state: EditingEmployee) => {
      const parsed = employeeSchema.parse(state.form);
      const ageNumber = parsed.age ? Number(parsed.age) : null;
      if (ageNumber !== null && (Number.isNaN(ageNumber) || ageNumber < 14 || ageNumber > 100)) {
        throw new Error("Age must be a number between 14 and 100");
      }
      const monthlySalary = Number(parsed.monthlySalary);
      if (!Number.isFinite(monthlySalary) || monthlySalary < 0) throw new Error("Monthly salary must be a valid non-negative amount");

      const payload = {
        ...(parsed.employeeCode?.trim() ? { employee_code: parsed.employeeCode.trim().toUpperCase() } : {}),
        name: parsed.name,
        phone: parsed.phone || null,
        address: parsed.address || null,
        age: ageNumber,
        role: parsed.role || null,
        active: parsed.active,
        join_date: parsed.joinDate,
        monthly_salary: Number(parsed.monthlySalary),
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
      if (!rowTimes.inDate || !rowTimes.inHour || !rowTimes.inMinute || !rowTimes.inPeriod) throw new Error("Check-in time is required");
      const checkIn = partsToIso(rowTimes.inDate, rowTimes.inHour, rowTimes.inMinute, rowTimes.inPeriod);
      const checkOut = rowTimes.outDate && rowTimes.outHour && rowTimes.outMinute && rowTimes.outPeriod ? partsToIso(rowTimes.outDate, rowTimes.outHour, rowTimes.outMinute, rowTimes.outPeriod) : null;
      if (checkOut && new Date(checkOut) <= new Date(checkIn)) throw new Error("Check-out must be after check-in");
      const { error } = editingRow.id
        ? await supabase.from("attendance").update({ check_in_at: checkIn, check_out_at: checkOut, status: "present" }).eq("id", editingRow.id)
        : await supabase.from("attendance").insert({ employee_id: editingRow.employee_id, work_date: editingRow.work_date, check_in_at: checkIn, check_out_at: checkOut, status: "present" });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Attendance updated");
      setEditingRow(null);
      await queryClient.invalidateQueries({ queryKey: ["attendance"] });
      await queryClient.invalidateQueries({ queryKey: ["payroll", "attendance"] });
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
      await queryClient.invalidateQueries({ queryKey: ["payroll", "attendance"] });
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
      await queryClient.invalidateQueries({ queryKey: ["payroll", "attendance"] });
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

  useEffect(() => {
    if (!settingsQuery.data) return;
    const raw = settingsQuery.data;
    const workingDays = Array.isArray(raw.working_days)
      ? raw.working_days.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
      : DEFAULT_PAYROLL_SETTINGS.working_days;
    setPayrollSettings({
      ...DEFAULT_PAYROLL_SETTINGS,
      ...raw,
      office_start: typeof raw.office_start === "string" ? raw.office_start.slice(0, 5) : DEFAULT_PAYROLL_SETTINGS.office_start,
      office_end: typeof raw.office_end === "string" ? raw.office_end.slice(0, 5) : DEFAULT_PAYROLL_SETTINGS.office_end,
      grace_start_minutes: Number.isFinite(Number(raw.grace_start_minutes)) ? Number(raw.grace_start_minutes) : 0,
      grace_end_minutes: Number.isFinite(Number(raw.grace_end_minutes)) ? Number(raw.grace_end_minutes) : 0,
      half_day_minutes: Number.isFinite(Number(raw.half_day_minutes)) ? Number(raw.half_day_minutes) : DEFAULT_PAYROLL_SETTINGS.half_day_minutes,
      overtime_multiplier: Number.isFinite(Number(raw.overtime_multiplier)) ? Number(raw.overtime_multiplier) : DEFAULT_PAYROLL_SETTINGS.overtime_multiplier,
      working_days: workingDays.length ? [...new Set(workingDays)].sort((a, b) => a - b) : DEFAULT_PAYROLL_SETTINGS.working_days,
    });
  }, [settingsQuery.data]);

  const salarySummaries = useMemo(() => {
    const today = todayIndia();
    const allHolidays = [...(holidaysQuery.data ?? []), ...getIndiaNationalHolidays(Number(salaryMonth.slice(0, 4)))];
    return (employeesQuery.data ?? []).map((employee) => calculateSalary(employee, salaryMonth, (salaryAttendanceQuery.data ?? []).filter((row) => row.employee_id === employee.id), allHolidays, (leavesQuery.data ?? []).filter((leave) => leave.employee_id === employee.id), payrollSettings, today));
  }, [employeesQuery.data, salaryMonth, salaryAttendanceQuery.data, holidaysQuery.data, leavesQuery.data, payrollSettings]);

  const filteredSalarySummaries = useMemo(() => {
    const term = salarySearch.trim().toLowerCase();
    if (!term) return salarySummaries;
    return salarySummaries.filter((summary) => (summary.employee.employee_code ?? "").toLowerCase().includes(term) || summary.employee.name.toLowerCase().includes(term));
  }, [salarySummaries, salarySearch]);

  const salaryOverall = useMemo(() => ({
    gross: salarySummaries.reduce((sum, item) => sum + item.basePay, 0),
    deductions: salarySummaries.reduce((sum, item) => sum + item.absenceDeduction + item.unpaidLeaveDeduction + item.lateDeduction + item.halfDayDeduction, 0),
    overtime: salarySummaries.reduce((sum, item) => sum + item.overtimePay, 0),
    net: salarySummaries.reduce((sum, item) => sum + item.netSalary, 0),
    employees: salarySummaries.length,
  }), [salarySummaries]);

  const selectedSalary = useMemo(() => salarySummaries.find((item) => item.employee.id === salaryEmployee) ?? salarySummaries[0] ?? null, [salarySummaries, salaryEmployee]);

  function printSalaryReceipt(summary: ReturnType<typeof calculateSalary>) {
    const rows = summary.days
      .filter((day) => day.status !== "not_joined" && day.status !== "upcoming")
      .map((day) => {
        const isNegative = day.status === "absent" || day.status === "unpaid_leave";
        const impact = isNegative
          ? -(day.status === "absent" || day.status === "unpaid_leave" ? summary.dailyRate : 0)
          : day.status === "present"
            ? day.basePay - day.lateDeduction + day.overtimePay
            : day.overtimePay;
        return `<tr><td>${day.label}</td><td>${day.status.replace("_", " ")}</td><td>${day.checkIn ? formatTime(day.checkIn) : "—"}</td><td>${day.checkOut ? formatTime(day.checkOut) : "—"}</td><td>${day.workedMinutes ? minutesLabel(day.workedMinutes) : "—"}</td><td>${day.lateMinutes ? minutesLabel(day.lateMinutes) : "—"}</td><td>${day.overtimeMinutes ? minutesLabel(day.overtimeMinutes) : "—"}</td><td class="${impact < 0 ? "neg" : impact > 0 ? "pos" : ""}">${impact < 0 ? "-" : ""}${money(Math.abs(impact))}</td></tr>`;
      }).join("");
    const win = window.open("", "_blank", "width=1100,height=800");
    if (!win) { toast.error("Allow pop-ups to print the salary receipt"); return; }
    win.document.write(`<!doctype html><html><head><title>Salary Receipt - ${summary.employee.name} - ${summary.monthLabel}</title><style>body{font-family:Arial,sans-serif;color:#171110;padding:32px}h1,h2{margin:0 0 6px}.muted{color:#666}.top{display:flex;justify-content:space-between;border-bottom:2px solid #171110;padding-bottom:18px;margin-bottom:20px}.net{font-size:28px;font-weight:700}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:20px 0}.card{border:1px solid #ddd;border-radius:10px;padding:12px}.label{font-size:11px;color:#666;text-transform:uppercase}.value{font-weight:700;margin-top:5px}.formula{margin:14px 0;padding:12px;border:1px solid #ddd;border-radius:10px;background:#fafafa;font-size:12px}.formula strong{font-size:13px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{padding:7px;border-bottom:1px solid #ddd;text-align:left}th{background:#f4f4f4}.right{text-align:right!important}.neg{color:#c1121f}.pos{color:#138a45}@media print{body{padding:10px}}</style></head><body><div class="top"><div><h1>PrintBall</h1><div class="muted">Monthly Salary Receipt · ${summary.monthLabel}</div><h2 style="margin-top:18px">${summary.employee.name}</h2><div class="muted">${summary.employee.employee_code} · ${summary.employee.role || "Staff"} · Joined ${formatDate(summary.employee.join_date)}</div></div><div class="right"><div class="label">Net payable</div><div class="net">${money(summary.netSalary)}</div></div></div><div class="formula"><strong>Payroll rate</strong><br>${money(summary.monthlySalary)} ÷ ${summary.calendarDays} calendar days = <strong>${money(summary.dailyRate)} / day</strong><br>${money(summary.dailyRate)} ÷ ${Math.round((summary.dailyRate / Math.max(summary.perMinuteRate, 0.000001)) || 0)} scheduled minutes = <strong>${money(summary.perMinuteRate)} / minute</strong></div><div class="cards"><div class="card"><div class="label">Base accrued</div><div class="value">${money(summary.basePay)}</div></div><div class="card"><div class="label">Late deduction</div><div class="value">-${money(summary.lateDeduction)}</div></div><div class="card"><div class="label">Absence / half / unpaid</div><div class="value">-${money(summary.absenceDeduction + summary.halfDayDeduction + summary.unpaidLeaveDeduction)}</div></div><div class="card"><div class="label">Overtime</div><div class="value">+${money(summary.overtimePay)}</div></div></div><table><thead><tr><th>Date</th><th>Status</th><th>In</th><th>Out</th><th>Worked</th><th>Late</th><th>OT</th><th class="right">Day impact</th></tr></thead><tbody>${rows}</tbody></table><script>window.onload=()=>{window.print();}</script></body></html>`);
    win.document.close();
  }

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  function openAttendanceEditor(workDate: string, row?: AttendanceRow) {
    const inFallback = time24ToParts(payrollSettings.office_start);
    const outFallback = time24ToParts(payrollSettings.office_end);
    const inParts = indiaParts(row?.check_in_at ?? null, workDate, payrollSettings.office_start);
    const outParts = indiaParts(row?.check_out_at ?? null, workDate, payrollSettings.office_end);
    setEditingRow(row ?? { id: "", employee_id: historyEmployee!, work_date: workDate, check_in_at: partsToIso(workDate, inFallback.hour, inFallback.minute, inFallback.period), check_out_at: partsToIso(workDate, outFallback.hour, outFallback.minute, outFallback.period), check_in_photo: null, check_out_photo: null, status: "present" });
    setRowTimes({ inDate: inParts.date, inHour: inParts.hour, inMinute: inParts.minute, inPeriod: inParts.period, outDate: outParts.date, outHour: outParts.hour, outMinute: outParts.minute, outPeriod: outParts.period });
  }

  function openEmployee(employee?: Employee) {
    setEditing(
      employee
        ? {
            id: employee.id,
            form: {
              employeeCode: employee.employee_code,
              name: employee.name,
              phone: employee.phone ?? "",
              address: employee.address ?? "",
              age: employee.age ? String(employee.age) : "",
              role: employee.role ?? "",
              active: employee.active,
              joinDate: employee.join_date,
              monthlySalary: String(employee.monthly_salary ?? 0),
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
            <TabsTrigger value="salary" className="h-10 rounded-lg px-5">Salary management</TabsTrigger>
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
                              <p className="truncate text-xs font-semibold tracking-wide text-primary">{employee.employee_code}</p>
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
            <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
              <section className="rounded-[1.5rem] border bg-card p-4 shadow-card">
                <div className="mb-4">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Staff attendance</p>
                  <h2 className="mt-1 text-xl">Attendance history</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Search by employee name or ID.</p>
                </div>
                <div className="relative mb-3">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} placeholder="Name or employee ID…" className="h-11 rounded-xl pl-9" />
                </div>
                <div className="max-h-[700px] space-y-2 overflow-y-auto pr-1">
                  {historyStaff.map((employee) => {
                    const selected = historyEmployee === employee.id;
                    return <button key={employee.id} type="button" onClick={() => setHistoryEmployee(employee.id)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${selected ? "border-primary bg-primary/5 shadow-sm" : "border-transparent hover:border-border hover:bg-muted/60"}`}>
                      {avatar(employee, "size-11")}
                      <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{employee.name}</span><span className="block text-xs font-semibold text-primary">{employee.employee_code}</span><span className="block truncate text-xs text-muted-foreground">{employee.role || "Staff"}</span></span>
                      {selected && <span className="size-2 rounded-full bg-primary" />}
                    </button>;
                  })}
                  {!historyStaff.length && <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No employee found.</div>}
                </div>
              </section>

              <section className="min-w-0 rounded-[1.5rem] border bg-card p-4 shadow-card sm:p-6">
                {!historyEmployee ? (
                  <div className="flex min-h-[520px] flex-col items-center justify-center text-center">
                    <div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-accent text-accent-foreground"><CalendarDays className="size-7" /></div>
                    <h2 className="text-2xl">Choose an employee</h2>
                    <p className="mt-2 max-w-sm text-sm text-muted-foreground">Search for a name or employee ID, then open the monthly calendar.</p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-4 border-b pb-5 xl:flex-row xl:items-center xl:justify-between">
                      <div className="flex items-center gap-3">
                        {historyEmployeeRecord && avatar(historyEmployeeRecord, "size-14")}
                        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Attendance history</p><h2 className="text-2xl">{historyEmployeeRecord?.name}</h2><p className="text-sm text-muted-foreground">{historyEmployeeRecord?.employee_code} · Joined {historyEmployeeRecord ? formatDate(historyEmployeeRecord.join_date) : "—"}</p></div>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Button variant="outline" className="h-10 rounded-xl" onClick={() => { setSalaryEmployee(historyEmployee); if (salaryMonth !== historyMonth) { setSalaryMonth(historyMonth); toast.success("Payout month selected. Open Salary management to view the receipt."); } else { const summary = salarySummaries.find((item) => item.employee.id === historyEmployee); if (summary) setReceipt(summary); } }}><FileText /> Payout</Button>
                        <Input type="month" value={historyMonth} max={todayIndia().slice(0, 7)} onChange={(e) => e.target.value && setHistoryMonth(e.target.value)} className="h-10 w-full rounded-xl sm:w-44" />
                        <div className="flex items-center gap-1 rounded-xl border bg-background p-1">
                          <Button variant="ghost" size="icon" onClick={() => { const [year, month] = historyMonth.split("-").map(Number); const date = new Date(year, month - 2, 1); setHistoryMonth(`${date.getFullYear()}-${pad(date.getMonth() + 1)}`); }}><ChevronLeft /></Button>
                          <span className="min-w-32 text-center text-sm font-semibold">{historyCalendar.monthLabel}</span>
                          <Button variant="ghost" size="icon" disabled={!historyCalendar.canGoNext} onClick={() => { const [year, month] = historyMonth.split("-").map(Number); const date = new Date(year, month, 1); setHistoryMonth(`${date.getFullYear()}-${pad(date.getMonth() + 1)}`); }}><ChevronRight /></Button>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 py-5 sm:grid-cols-2 xl:grid-cols-5">
                      <div className="rounded-2xl border bg-success/5 p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Present</p><p className="mt-1 text-3xl font-display text-success">{historyCalendar.presentDays.length}</p></div>
                      <div className="rounded-2xl border bg-destructive/5 p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Absent</p><p className="mt-1 text-3xl font-display text-destructive">{historyCalendar.absentDays}</p></div>
                      <div className="rounded-2xl border bg-muted/50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Cleared</p><p className="mt-1 text-3xl font-display text-muted-foreground">{historyCalendar.clearedDays.length}</p></div>
                      <div className="rounded-2xl border bg-amber-500/5 p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Holidays</p><p className="mt-1 text-3xl font-display">{historyCalendar.holidayDays}</p></div>
                      <div className="rounded-2xl border bg-muted/50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Working days</p><p className="mt-1 text-3xl font-display">{historyCalendar.totalWorkingDays}</p></div>
                    </div>

                    <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-2"><span className="size-3 rounded bg-success" /> Present</span>
                      <span className="inline-flex items-center gap-2"><span className="size-3 rounded bg-destructive" /> Absent</span>
                      <span className="inline-flex items-center gap-2"><span className="size-3 rounded border bg-background" /> Cleared</span>
                      <span className="inline-flex items-center gap-2"><span className="size-3 rounded bg-amber-400/60" /> Holiday</span>
                      <span className="inline-flex items-center gap-2"><span className="size-3 rounded bg-muted" /> Weekly off</span>
                    </div>

                    <div className="overflow-hidden rounded-2xl border">
                      <div className="grid grid-cols-7 border-b bg-muted/50">
                        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day) => <div key={day} className="px-1 py-3 text-center text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:px-2 sm:text-xs">{day}</div>)}
                      </div>
                      {historyCalendar.weeks.map((week, weekIndex) => (
                        <div key={weekIndex} className="grid grid-cols-7 divide-x border-b last:border-b-0">
                          {week.map((item, index) => {
                            if (!item) return <div key={index} className="min-h-32 bg-muted/10" />;
                            const row = historyCalendar.attendanceByDate.get(item.key);
                            const notJoined = item.key < (historyEmployeeRecord?.join_date ?? "9999-12-31");
                            const future = item.key > todayIndia();
                            const holidayName = historyCalendar.holidayMap.get(item.key);
                            const working = payrollSettings.working_days.includes(item.weekday);
                            const cleared = row?.status === "cleared";
                            const present = row?.status === "present" && !notJoined;
                            return <div key={item.key} className="min-w-0 p-1 sm:p-1.5">
                              {notJoined ? <div className="flex min-h-32 h-full flex-col rounded-xl border border-dashed bg-muted/20 p-2 text-muted-foreground"><span className="font-display text-xl">{item.day}</span><span className="mt-auto text-[9px]">Not joined</span></div>
                              : holidayName ? <div className="flex min-h-32 h-full flex-col rounded-xl border border-amber-500/20 bg-amber-500/5 p-2"><span className="font-display text-xl">{item.day}</span><span className="mt-auto line-clamp-2 text-[10px] font-semibold text-amber-700 dark:text-amber-300">{holidayName}</span></div>
                              : !working ? <div className="flex min-h-32 h-full flex-col rounded-xl border bg-muted/30 p-2 text-muted-foreground"><span className="font-display text-xl">{item.day}</span><span className="mt-auto text-[10px] font-semibold">Weekly off</span></div>
                              : cleared ? <div className="relative flex min-h-32 h-full flex-col rounded-xl border bg-background p-2.5 pr-9"><span className="font-display text-xl text-muted-foreground">{item.day}</span><span className="mt-auto text-[10px] font-semibold text-muted-foreground">Cleared · no deduction</span><button type="button" title="Delete record" className="absolute bottom-1.5 right-1.5 inline-flex size-7 items-center justify-center rounded-lg border text-destructive" onClick={() => setAttendanceAction({ type: "delete", row: row! })}><Trash2 className="size-3.5" /></button><button type="button" className="mt-1 text-left text-[10px] font-semibold text-primary hover:underline" onClick={() => openAttendanceEditor(item.key, row!)}>Mark present</button></div>
                              : present ? <div className="relative flex min-h-32 h-full min-w-0 flex-col rounded-xl border border-success/30 bg-success/10 p-2.5 pr-9"><button type="button" onClick={() => setPhotoRow(row!)} className="flex min-w-0 items-center gap-1.5 text-left"><span className="font-display text-xl leading-none text-success">{item.day}</span><span className="rounded-full bg-success px-1.5 py-0.5 text-[9px] font-bold text-success-foreground">P</span></button><button title="Edit attendance" type="button" className="absolute right-1.5 top-1.5 inline-flex size-7 items-center justify-center rounded-lg border bg-background/95 shadow-sm" onClick={() => openAttendanceEditor(item.key, row!)}><Pencil className="size-3.5" /></button><button title="Clear day" type="button" className="absolute right-1.5 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-lg border bg-background/95 text-muted-foreground shadow-sm" onClick={() => setAttendanceAction({ type: "clear", row: row! })}><Eraser className="size-3.5" /></button><button title="Delete record" type="button" className="absolute bottom-1.5 right-1.5 inline-flex size-7 items-center justify-center rounded-lg border bg-background/95 text-destructive shadow-sm" onClick={() => setAttendanceAction({ type: "delete", row: row! })}><Trash2 className="size-3.5" /></button><button type="button" onClick={() => setPhotoRow(row!)} className="mt-auto min-w-0 text-left"><span className="block truncate text-[10px] font-semibold text-success">Present</span><span className="block truncate text-[9px] text-muted-foreground">IN {formatTime(row!.check_in_at)}</span><span className="block truncate text-[9px] text-muted-foreground">OUT {formatTime(row!.check_out_at)}</span></button></div>
                              : <div className={`flex min-h-32 h-full flex-col rounded-xl border p-2 ${future ? "border-border bg-muted/20 text-muted-foreground" : "border-destructive/25 bg-destructive/10"}`}><div className="flex items-center justify-between"><span className="font-display text-xl">{item.day}</span>{!future && <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[9px] font-bold text-destructive-foreground">A</span>}</div><span className={`mt-auto text-[10px] font-semibold ${future ? "text-muted-foreground" : "text-destructive"}`}>{future ? "Upcoming" : "Absent"}</span>{!future && <button type="button" className="mt-1 text-left text-[9px] font-semibold text-primary hover:underline" onClick={() => openAttendanceEditor(item.key)}>+ Mark present</button>}</div>}
                            </div>;
                          })}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </section>
            </div>
          </TabsContent>

          <TabsContent value="salary" className="mt-5 space-y-5">
            <section className="rounded-[1.5rem] border bg-card p-5 shadow-card sm:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Payroll workspace</p><h2 className="mt-1 text-2xl">Salary management</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Review monthly payout, late deductions, overtime and leave for every employee. Historical months remain available for review and printing.</p></div>
                <div className="flex flex-col gap-2 sm:flex-row"><Input type="month" value={salaryMonth} max={todayIndia().slice(0, 7)} onChange={(e) => e.target.value && setSalaryMonth(e.target.value)} className="h-11 rounded-xl sm:w-44" /><Button variant="outline" className="h-11 rounded-xl" onClick={() => document.getElementById("payroll-settings")?.scrollIntoView({ behavior: "smooth" })}><Settings2 /> Office policy</Button></div>
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-2xl border bg-success/5 p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Total payable</p><p className="mt-1 text-2xl font-display text-success">{money(salaryOverall.net)}</p><p className="mt-1 text-xs text-muted-foreground">{salaryOverall.employees} employees</p></div>
              <div className="rounded-2xl border p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Base earned</p><p className="mt-1 text-2xl font-display">{money(salaryOverall.gross)}</p></div>
              <div className="rounded-2xl border bg-destructive/5 p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Total deductions</p><p className="mt-1 text-2xl font-display text-destructive">-{money(salaryOverall.deductions)}</p></div>
              <div className="rounded-2xl border bg-success/5 p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Overtime added</p><p className="mt-1 text-2xl font-display text-success">+{money(salaryOverall.overtime)}</p></div>
              <div className="rounded-2xl border bg-muted/50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Month</p><p className="mt-1 text-lg font-semibold">{salarySummaries[0]?.monthLabel ?? salaryMonth}</p></div>
            </section>

            <section className="rounded-[1.5rem] border bg-card p-5 shadow-card sm:p-6">
              <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><h3 className="text-xl">Employee payouts</h3><p className="text-sm text-muted-foreground">Search by name or employee ID, then open the full monthly receipt.</p></div><div className="relative w-full lg:w-80"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={salarySearch} onChange={(e) => setSalarySearch(e.target.value)} placeholder="Search name or employee ID…" className="h-11 rounded-xl pl-9" /></div></div>
              {filteredSalarySummaries.length === 0 ? <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">No employee matches your search.</div> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{filteredSalarySummaries.map((summary) => { const deductions = summary.absenceDeduction + summary.unpaidLeaveDeduction + summary.lateDeduction + summary.halfDayDeduction; return <article key={summary.employee.id} className={`rounded-2xl border p-4 transition ${salaryEmployee === summary.employee.id ? "border-primary bg-primary/5 shadow-sm" : "bg-background hover:shadow-md"}`}>
                <div className="flex items-start gap-3">{avatar(summary.employee, "size-12")}<div className="min-w-0 flex-1"><p className="truncate font-semibold">{summary.employee.name}</p><p className="text-xs font-bold tracking-wide text-primary">{summary.employee.employee_code}</p><p className="truncate text-xs text-muted-foreground">{summary.employee.role || "Staff"}</p></div></div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-muted/60 p-2.5"><span className="text-muted-foreground">Monthly</span><strong className="mt-0.5 block">{money(summary.monthlySalary)}</strong></div><div className="rounded-xl bg-success/5 p-2.5"><span className="text-muted-foreground">Net payable</span><strong className="mt-0.5 block text-success">{money(summary.netSalary)}</strong></div><div className="rounded-xl bg-muted/60 p-2.5"><span className="text-muted-foreground">Present</span><strong className="mt-0.5 block">{summary.presentDays}{summary.halfDays ? ` · ${summary.halfDays} half` : ""}</strong></div><div className="rounded-xl bg-muted/60 p-2.5"><span className="text-muted-foreground">Late / OT</span><strong className="mt-0.5 block">{minutesLabel(summary.lateMinutes)} / {minutesLabel(summary.overtimeMinutes)}</strong></div></div>
                <div className="mt-3 flex items-center justify-between border-t pt-3"><span className="text-xs text-muted-foreground">Deductions {money(deductions)}</span><Button size="sm" className="rounded-lg" onClick={() => { setSalaryEmployee(summary.employee.id); setReceipt(summary); }}><FileText /> View receipt</Button></div>
              </article>; })}</div>}
            </section>

            {selectedSalary && <section className="rounded-[1.5rem] border bg-card p-5 shadow-card sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3">{avatar(selectedSalary.employee, "size-12")}<div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Selected payout</p><h3 className="text-xl">{selectedSalary.employee.name}</h3><p className="text-xs text-muted-foreground">{selectedSalary.employee.employee_code} · {selectedSalary.monthLabel}</p></div></div><Button variant="outline" className="rounded-xl" onClick={() => setReceipt(selectedSalary)}><FileText /> Full receipt</Button></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6"><div className="rounded-2xl border bg-success/5 p-4"><p className="text-xs text-muted-foreground">Net salary</p><p className="mt-1 text-2xl font-display text-success">{money(selectedSalary.netSalary)}</p></div><div className="rounded-2xl border p-4"><p className="text-xs text-muted-foreground">Late deduction</p><p className="mt-1 text-xl font-semibold text-destructive">-{money(selectedSalary.lateDeduction)}</p></div><div className="rounded-2xl border p-4"><p className="text-xs text-muted-foreground">Absence / half / unpaid</p><p className="mt-1 text-xl font-semibold text-destructive">-{money(selectedSalary.absenceDeduction + selectedSalary.halfDayDeduction + selectedSalary.unpaidLeaveDeduction)}</p></div><div className="rounded-2xl border p-4"><p className="text-xs text-muted-foreground">Per minute</p><p className="mt-1 text-xl font-semibold">{money(selectedSalary.perMinuteRate)}</p></div><div className="rounded-2xl border p-4"><p className="text-xs text-muted-foreground">Overtime</p><p className="mt-1 text-xl font-semibold text-success">+{money(selectedSalary.overtimePay)}</p></div><div className="rounded-2xl border p-4"><p className="text-xs text-muted-foreground">Worked</p><p className="mt-1 text-xl font-semibold">{minutesLabel(selectedSalary.workedMinutes)}</p></div></div></section>}

            <section id="payroll-settings" className="rounded-[1.5rem] border bg-card p-5 shadow-card sm:p-6">
              <div className="mb-5 flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground"><Settings2 className="size-5" /></div><div><h3 className="font-semibold">Office working & salary policy</h3><p className="text-xs text-muted-foreground">All times use 12-hour AM/PM controls. Start and end grace periods are independent.</p></div></div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2"><Label>Office starts</Label><Time12Input value={payrollSettings.office_start} onChange={(value) => setPayrollSettings({ ...payrollSettings, office_start: value })} /></div>
                <div className="space-y-2"><Label>Office closes</Label><Time12Input value={payrollSettings.office_end} onChange={(value) => setPayrollSettings({ ...payrollSettings, office_end: value })} /></div>
                <div className="space-y-2"><Label>Start grace period</Label><Input type="number" min="0" max="720" value={payrollSettings.grace_start_minutes} onChange={(e) => setPayrollSettings({ ...payrollSettings, grace_start_minutes: Math.max(0, Number(e.target.value) || 0) })} /><p className="text-[11px] text-muted-foreground">Late deduction starts after opening time + this grace.</p></div>
                <div className="space-y-2"><Label>End grace period</Label><Input type="number" min="0" max="720" value={payrollSettings.grace_end_minutes} onChange={(e) => setPayrollSettings({ ...payrollSettings, grace_end_minutes: Math.max(0, Number(e.target.value) || 0) })} /><p className="text-[11px] text-muted-foreground">Overtime starts after closing time + this grace.</p></div>
                <div className="space-y-2"><Label>Half-day threshold</Label><Input type="number" min="1" max="1440" value={payrollSettings.half_day_minutes} onChange={(e) => setPayrollSettings({ ...payrollSettings, half_day_minutes: Math.max(1, Number(e.target.value) || 1) })} /><p className="text-[11px] text-muted-foreground">Worked time below this becomes a half day.</p></div>
                <div className="space-y-2"><Label>Overtime multiplier</Label><Input type="number" min="0" step="0.25" value={payrollSettings.overtime_multiplier} onChange={(e) => setPayrollSettings({ ...payrollSettings, overtime_multiplier: Math.max(0, Number(e.target.value) || 0) })} /><p className="text-[11px] text-muted-foreground">1× normal rate · 2× double rate.</p></div>
                <div className="sm:col-span-2 lg:col-span-2"><Label>Working days</Label><div className="mt-2 flex flex-wrap gap-2">{[[0,"Sunday OT"],[1,"Mon"],[2,"Tue"],[3,"Wed"],[4,"Thu"],[5,"Fri"],[6,"Sat"]].map(([value,label]) => { const checked = payrollSettings.working_days.includes(Number(value)); return <label key={String(value)} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${checked ? "bg-primary/5" : "bg-background"}`}><Checkbox checked={checked} onCheckedChange={(v) => setPayrollSettings({ ...payrollSettings, working_days: v ? [...new Set([...payrollSettings.working_days, Number(value)])].sort((a,b) => a-b) : payrollSettings.working_days.filter((day) => day !== Number(value)) })} />{label}</label>; })}</div><p className="mt-2 text-[11px] text-muted-foreground">Sunday is a paid weekly holiday by default. Enable “Sunday OT” only when Sunday work should be allowed; every worked Sunday minute is then paid as overtime. A missing Sunday never creates an absence deduction.</p></div>
              </div>
              <div className="mt-5 flex justify-end"><Button disabled={!payrollSettings.office_start || !payrollSettings.office_end || settingsQuery.isFetching} className="rounded-xl" onClick={async () => { const start = payrollSettings.office_start; const end = payrollSettings.office_end; if (start >= end) { toast.error("Office closing time must be after opening time"); return; } if (!payrollSettings.working_days.length) { toast.error("Select at least one working day"); return; } const { error } = await supabase.from("payroll_settings").upsert({ id: 1, office_start: start, office_end: end, grace_start_minutes: payrollSettings.grace_start_minutes, grace_end_minutes: payrollSettings.grace_end_minutes, half_day_minutes: payrollSettings.half_day_minutes, overtime_multiplier: payrollSettings.overtime_multiplier, working_days: payrollSettings.working_days }); if (error) { toast.error(error.message); return; } toast.success("Salary policy saved"); await queryClient.invalidateQueries({ queryKey: ["payroll", "settings"] }); await queryClient.invalidateQueries({ queryKey: ["payroll", "attendance"] }); }}>Save office policy</Button></div>
            </section>

            <section className="rounded-[1.5rem] border bg-card p-5 shadow-card sm:p-6">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-xl">Holidays & leave</h3><p className="text-sm text-muted-foreground">India's three national days are included automatically every year. Add festival, company or special holidays as ranges.</p></div><div className="flex gap-2"><Button variant="outline" className="rounded-xl" onClick={() => setHolidayDialog(true)}><Gift /> Add holiday</Button><Button variant="outline" className="rounded-xl" onClick={() => { setLeaveForm((v) => ({ ...v, employeeId: v.employeeId || employeesQuery.data?.[0]?.id || "" })); setLeaveDialog(true); }}><CalendarPlus /> Add leave</Button></div></div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border p-4"><div className="mb-3 flex items-center justify-between"><p className="font-semibold">Automatic national holidays</p><Badge variant="secondary" className="rounded-full">{salaryMonth.slice(0,4)}</Badge></div><div className="grid gap-2 sm:grid-cols-3">{getIndiaNationalHolidays(Number(salaryMonth.slice(0,4))).map((holiday) => <div key={holiday.id} className="rounded-xl bg-amber-500/5 p-3"><p className="font-medium">{holiday.name}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(holiday.holiday_date)}</p></div>)}</div></div>
                <div className="rounded-2xl border p-4"><div className="mb-3 flex items-center justify-between"><p className="font-semibold">Custom holidays</p><span className="text-xs text-muted-foreground">Saved in Supabase</span></div><div className="max-h-48 space-y-2 overflow-y-auto pr-1">{(holidaysQuery.data ?? []).filter((h) => (h.end_date ?? h.holiday_date) >= `${salaryMonth}-01`).slice(0, 12).map((holiday) => <div key={holiday.id} className="flex items-center justify-between rounded-xl bg-muted/50 p-3"><div><p className="font-medium">{holiday.name}</p><p className="text-xs text-muted-foreground">{formatDate(holiday.start_date ?? holiday.holiday_date)}{(holiday.end_date ?? holiday.holiday_date) !== (holiday.start_date ?? holiday.holiday_date) ? ` – ${formatDate(holiday.end_date!)}` : ""}</p></div><Button variant="ghost" size="icon" className="text-destructive" onClick={async () => { const { error } = await supabase.from("holidays").delete().eq("id", holiday.id); if (error) toast.error(error.message); else { toast.success("Holiday removed"); await queryClient.invalidateQueries({ queryKey: ["payroll", "holidays"] }); } }}><Trash2 /></Button></div>)}{!(holidaysQuery.data ?? []).length && <p className="py-5 text-center text-sm text-muted-foreground">No custom holidays added.</p>}</div></div>
              </div>
              <div className="mt-4 rounded-2xl border p-4"><div className="mb-3 flex items-center justify-between"><p className="font-semibold">Recent leave records</p><Button variant="ghost" size="sm" onClick={() => { setLeaveForm((v) => ({ ...v, employeeId: v.employeeId || employeesQuery.data?.[0]?.id || "" })); setLeaveDialog(true); }}>Add leave</Button></div><div className="grid gap-2 md:grid-cols-2">{(leavesQuery.data ?? []).slice(0, 8).map((leave) => { const employee = employeesQuery.data?.find((e) => e.id === leave.employee_id); return <div key={leave.id} className="flex items-center justify-between rounded-xl bg-muted/50 p-3"><div className="min-w-0"><p className="truncate font-medium">{employee?.employee_code} · {employee?.name || "Employee"} · <span className={leave.leave_type === "paid" ? "text-success" : "text-destructive"}>{leave.leave_type} leave</span></p><p className="text-xs text-muted-foreground">{formatDate(leave.start_date)} – {formatDate(leave.end_date)}{leave.reason ? ` · ${leave.reason}` : ""}</p></div><Button variant="ghost" size="icon" className="shrink-0 text-destructive" onClick={async () => { const { error } = await supabase.from("employee_leaves").delete().eq("id", leave.id); if (error) toast.error(error.message); else { toast.success("Leave removed"); await queryClient.invalidateQueries({ queryKey: ["payroll", "leaves"] }); } }}><Trash2 /></Button></div>; })}{!(leavesQuery.data ?? []).length && <p className="py-5 text-center text-sm text-muted-foreground">No leave records added.</p>}</div></div>
            </section>
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
                <div className="space-y-2"><Label htmlFor="employeeCode">Employee ID</Label><Input id="employeeCode" value={editing.form.employeeCode} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, employeeCode: e.target.value } })} placeholder="PB-0001" /><p className="text-xs text-muted-foreground">Leave blank to auto-generate the next PrintBall ID.</p></div>
                <div className="space-y-2"><Label htmlFor="name">Full name</Label><Input id="name" value={editing.form.name} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, name: e.target.value } })} placeholder="Employee name" /></div>
                <div className="space-y-2"><Label htmlFor="role">Role</Label><Input id="role" value={editing.form.role} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, role: e.target.value } })} placeholder="Designer, operator…" /></div>
                <div className="space-y-2"><Label htmlFor="phone">Phone</Label><Input id="phone" value={editing.form.phone} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, phone: e.target.value } })} /></div>
                <div className="space-y-2"><Label htmlFor="age">Age</Label><Input id="age" inputMode="numeric" value={editing.form.age} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, age: e.target.value } })} /></div>
                <div className="space-y-2"><Label htmlFor="joinDate">Joining date</Label><Input id="joinDate" type="date" value={editing.form.joinDate} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, joinDate: e.target.value } })} /><p className="text-xs text-muted-foreground">Attendance before this date is left blank and excluded from totals.</p></div>
                <div className="space-y-2"><Label htmlFor="monthlySalary">Monthly salary (₹)</Label><Input id="monthlySalary" type="number" min="0" step="0.01" value={editing.form.monthlySalary} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, monthlySalary: e.target.value } })} placeholder="25000" /><p className="text-xs text-muted-foreground">Used as the employee's monthly salary before attendance adjustments.</p></div>
                <div className="space-y-2 sm:col-span-2"><Label htmlFor="address">Address</Label><Textarea id="address" value={editing.form.address} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, address: e.target.value } })} /></div>
              </div>
              <div className="flex items-center justify-between rounded-2xl border p-4"><div><p className="font-medium">Active employee</p><p className="text-xs text-muted-foreground">Inactive employees are hidden from the attendance screen.</p></div><Switch checked={editing.form.active} onCheckedChange={(checked) => setEditing({ ...editing, form: { ...editing.form, active: checked } })} /></div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button disabled={saveEmployee.isPending} onClick={() => editing && saveEmployee.mutate(editing)}>{saveEmployee.isPending ? "Saving…" : "Save employee"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editingRow !== null} onOpenChange={(open) => !open && setEditingRow(null)}>
        <DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{editingRow?.id ? "Edit attendance" : "Add attendance"}</DialogTitle></DialogHeader>{editingRow && <div className="space-y-5"><div className="rounded-2xl bg-muted/50 p-4"><p className="font-semibold">{historyEmployeeRecord?.name}</p><p className="text-xs font-bold tracking-wide text-primary">{historyEmployeeRecord?.employee_code}</p><p className="mt-1 text-xs text-muted-foreground">Attendance date: {formatDate(editingRow.work_date)}</p></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Check-in date</Label><Input type="date" value={rowTimes.inDate} onChange={(e) => setRowTimes({ ...rowTimes, inDate: e.target.value })} /></div><div className="space-y-2"><Label>Check-in time</Label><div className="grid grid-cols-3 gap-2"><select value={rowTimes.inHour} onChange={(e) => setRowTimes({ ...rowTimes, inHour: e.target.value })} className="h-10 rounded-xl border bg-background px-2 text-sm">{Array.from({ length: 12 }, (_, i) => String(i + 1)).map((h) => <option key={h}>{h}</option>)}</select><select value={rowTimes.inMinute} onChange={(e) => setRowTimes({ ...rowTimes, inMinute: e.target.value })} className="h-10 rounded-xl border bg-background px-2 text-sm">{Array.from({ length: 60 }, (_, i) => pad(i)).map((m) => <option key={m}>{m}</option>)}</select><select value={rowTimes.inPeriod} onChange={(e) => setRowTimes({ ...rowTimes, inPeriod: e.target.value })} className="h-10 rounded-xl border bg-background px-2 text-sm"><option>AM</option><option>PM</option></select></div></div><div className="space-y-2"><Label>Check-out date</Label><Input type="date" value={rowTimes.outDate} onChange={(e) => setRowTimes({ ...rowTimes, outDate: e.target.value })} /></div><div className="space-y-2"><Label>Check-out time</Label><div className="grid grid-cols-3 gap-2"><select value={rowTimes.outHour} onChange={(e) => setRowTimes({ ...rowTimes, outHour: e.target.value })} className="h-10 rounded-xl border bg-background px-2 text-sm">{Array.from({ length: 12 }, (_, i) => String(i + 1)).map((h) => <option key={h}>{h}</option>)}</select><select value={rowTimes.outMinute} onChange={(e) => setRowTimes({ ...rowTimes, outMinute: e.target.value })} className="h-10 rounded-xl border bg-background px-2 text-sm">{Array.from({ length: 60 }, (_, i) => pad(i)).map((m) => <option key={m}>{m}</option>)}</select><select value={rowTimes.outPeriod} onChange={(e) => setRowTimes({ ...rowTimes, outPeriod: e.target.value })} className="h-10 rounded-xl border bg-background px-2 text-sm"><option>AM</option><option>PM</option></select></div></div></div><p className="text-xs text-muted-foreground">New attendance entries are automatically prefilled with the selected day's date, office start time and office close time from the current policy. You can edit them before saving.</p></div>}<DialogFooter><Button variant="outline" onClick={() => setEditingRow(null)}>Cancel</Button><Button disabled={saveRow.isPending} onClick={() => saveRow.mutate()}>{saveRow.isPending ? "Saving…" : "Save attendance"}</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={photoRow !== null} onOpenChange={(open) => !open && setPhotoRow(null)}>
        <DialogContent className="max-h-[94vh] max-w-6xl overflow-y-auto"><DialogHeader><DialogTitle>{photoRow ? `${historyEmployeeRecord?.name ?? "Employee"} · ${formatDate(photoRow.work_date)}` : "Attendance photos"}</DialogTitle></DialogHeader>{photosQuery.isLoading ? <p className="py-12 text-center text-sm text-muted-foreground">Loading photos…</p> : <div className="grid gap-6 lg:grid-cols-2">{([['Check in', photosQuery.data?.inUrl, photoRow?.check_in_at], ['Check out', photosQuery.data?.outUrl, photoRow?.check_out_at]] as const).map(([label, url, time]) => <figure key={label} className="overflow-hidden rounded-2xl border bg-muted/20"><div className="flex items-center justify-between border-b bg-card px-4 py-3"><figcaption className="font-semibold">{label}</figcaption><span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><Clock3 className="size-4" /> {formatTime(time ?? null)}</span></div>{url ? <div className="flex min-h-[360px] items-center justify-center bg-black/5 p-3"><img src={url} alt={`${label} photo`} className="max-h-[70vh] w-full rounded-xl object-contain" /></div> : <div className="flex min-h-[360px] items-center justify-center text-sm text-muted-foreground">No {label.toLowerCase()} photo was captured.</div>}</figure>)}</div>}</DialogContent>
      </Dialog>

      <Dialog open={receipt !== null} onOpenChange={(open) => !open && setReceipt(null)}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogHeader><DialogTitle>Monthly salary receipt · {receipt?.employee.name}</DialogTitle></DialogHeader>
          {receipt && <div className="space-y-5 print:text-black">
            <div className="rounded-2xl border bg-muted/30 p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-3">{avatar(receipt.employee, "size-12")}<div><p className="text-lg font-bold">PrintBall</p><p className="text-sm text-muted-foreground">Salary statement · {receipt.monthLabel}</p></div></div><p className="mt-4 font-semibold">{receipt.employee.name}</p><p className="text-sm text-muted-foreground">{receipt.employee.employee_code} · {receipt.employee.role || "Staff"} · Joined {formatDate(receipt.employee.join_date)}</p></div><div className="text-left sm:text-right"><p className="text-xs uppercase tracking-wider text-muted-foreground">Net payable</p><p className="text-3xl font-display">{money(receipt.netSalary)}</p></div></div></div>
            <div className="rounded-xl border bg-muted/20 p-3 text-sm"><span className="font-semibold">Rate for this month:</span> {money(receipt.monthlySalary)} ÷ {receipt.calendarDays} calendar days = <strong>{money(receipt.dailyRate)}/day</strong> · <strong>{money(receipt.perMinuteRate)}/minute</strong>. February automatically uses 28 days or 29 in a leap year.</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"><div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Base accrued</p><p className="font-semibold">{money(receipt.basePay)}</p></div><div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Per day</p><p className="font-semibold">{money(receipt.dailyRate)}</p></div><div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Per minute</p><p className="font-semibold">{money(receipt.perMinuteRate)}</p></div><div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Late deduction</p><p className="font-semibold text-destructive">-{money(receipt.lateDeduction)}</p></div><div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Absence / half / unpaid</p><p className="font-semibold text-destructive">-{money(receipt.absenceDeduction + receipt.halfDayDeduction + receipt.unpaidLeaveDeduction)}</p></div><div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Overtime</p><p className="font-semibold text-success">+{money(receipt.overtimePay)}</p></div></div>
            <div className="overflow-hidden rounded-2xl border"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/50"><tr><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2">In</th><th className="px-3 py-2">Out</th><th className="px-3 py-2">Worked</th><th className="px-3 py-2">Late</th><th className="px-3 py-2">OT</th><th className="px-3 py-2 text-right">Day impact</th></tr></thead><tbody>{receipt.days.filter((day) => day.status !== "not_joined" && day.status !== "upcoming").map((day) => { const negative = day.status === "absent" || day.status === "unpaid_leave"; const impact = negative ? -receipt.dailyRate : day.status === "present" ? day.basePay - day.lateDeduction + day.overtimePay : day.overtimePay; return <tr key={day.date} className="border-t"><td className="px-3 py-2 font-medium">{day.label}</td><td className="px-3 py-2 capitalize">{day.status.replace("_", " ")}</td><td className="px-3 py-2 text-center">{day.checkIn ? formatTime(day.checkIn) : "—"}</td><td className="px-3 py-2 text-center">{day.checkOut ? formatTime(day.checkOut) : "—"}</td><td className="px-3 py-2 text-center">{day.workedMinutes ? minutesLabel(day.workedMinutes) : "—"}</td><td className="px-3 py-2 text-center">{day.lateMinutes ? minutesLabel(day.lateMinutes) : "—"}</td><td className="px-3 py-2 text-center">{day.overtimeMinutes ? minutesLabel(day.overtimeMinutes) : "—"}</td><td className={`px-3 py-2 text-right font-semibold ${negative ? "text-destructive" : impact > 0 ? "text-success" : ""}`}>{impact < 0 ? `-${money(Math.abs(impact))}` : money(impact)}</td></tr>; })}</tbody></table></div></div>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setReceipt(null)}>Close</Button><Button onClick={() => printSalaryReceipt(receipt)}><FileText /> Print / Save PDF</Button></div>
          </div>}
        </DialogContent>
      </Dialog>

      <Dialog open={holidayDialog} onOpenChange={setHolidayDialog}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Add holiday</DialogTitle></DialogHeader><div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Start date</Label><Input type="date" value={holidayForm.startDate} onChange={(e) => setHolidayForm({ ...holidayForm, startDate: e.target.value })} /></div><div className="space-y-2"><Label>End date</Label><Input type="date" value={holidayForm.endDate} min={holidayForm.startDate} onChange={(e) => setHolidayForm({ ...holidayForm, endDate: e.target.value })} /></div></div><div className="space-y-2"><Label>Holiday name</Label><Input value={holidayForm.name} onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })} placeholder="Diwali, company holiday…" /></div><p className="text-xs text-muted-foreground">Every date in the range is treated as a paid holiday and does not create an absence deduction.</p></div><DialogFooter><Button variant="outline" onClick={() => setHolidayDialog(false)}>Cancel</Button><Button onClick={async () => { if (!holidayForm.startDate || !holidayForm.endDate || holidayForm.endDate < holidayForm.startDate || !holidayForm.name.trim()) { toast.error("Select a valid date range and holiday name"); return; } const { error } = await supabase.from("holidays").insert({ holiday_date: holidayForm.startDate, start_date: holidayForm.startDate, end_date: holidayForm.endDate, name: holidayForm.name.trim() }); if (error) toast.error(error.message); else { toast.success("Holiday added"); setHolidayDialog(false); setHolidayForm({ startDate: todayIndia(), endDate: todayIndia(), name: "" }); await queryClient.invalidateQueries({ queryKey: ["payroll", "holidays"] }); } }}>Add holiday</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={leaveDialog} onOpenChange={setLeaveDialog}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Add employee leave</DialogTitle></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label>Employee</Label><select value={leaveForm.employeeId} onChange={(e) => setLeaveForm({ ...leaveForm, employeeId: e.target.value })} className="h-10 w-full rounded-md border bg-background px-3 text-sm">{(employeesQuery.data ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></div><div className="space-y-2"><Label>Start date</Label><Input type="date" value={leaveForm.startDate} onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })} /></div><div className="space-y-2"><Label>End date</Label><Input type="date" value={leaveForm.endDate} onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })} /></div><div className="space-y-2 sm:col-span-2"><Label>Leave type</Label><div className="flex gap-2"><Button type="button" variant={leaveForm.type === "paid" ? "default" : "outline"} className="flex-1 rounded-xl" onClick={() => setLeaveForm({ ...leaveForm, type: "paid" })}>Paid leave</Button><Button type="button" variant={leaveForm.type === "unpaid" ? "default" : "outline"} className="flex-1 rounded-xl" onClick={() => setLeaveForm({ ...leaveForm, type: "unpaid" })}>Unpaid leave</Button></div></div><div className="space-y-2 sm:col-span-2"><Label>Reason (optional)</Label><Input value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} placeholder="Personal leave…" /></div></div><DialogFooter><Button variant="outline" onClick={() => setLeaveDialog(false)}>Cancel</Button><Button onClick={async () => { if (!leaveForm.employeeId || leaveForm.endDate < leaveForm.startDate) { toast.error("Select an employee and valid date range"); return; } const { error } = await supabase.from("employee_leaves").insert({ employee_id: leaveForm.employeeId, start_date: leaveForm.startDate, end_date: leaveForm.endDate, leave_type: leaveForm.type, reason: leaveForm.reason.trim() || null }); if (error) toast.error(error.message); else { toast.success("Leave added"); setLeaveDialog(false); setLeaveForm({ employeeId: leaveForm.employeeId, startDate: todayIndia(), endDate: todayIndia(), type: "paid", reason: "" }); await queryClient.invalidateQueries({ queryKey: ["payroll", "leaves"] }); } }}>Save leave</Button></DialogFooter></DialogContent></Dialog>

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
