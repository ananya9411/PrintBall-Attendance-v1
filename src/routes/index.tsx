import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Check, Clock, LogIn, LogOut, Search, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";

import { AttendanceCamera } from "@/components/AttendanceCamera";
import logo from "@/assets/printball-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  type AttendanceRow,
  type Employee,
  checkIn,
  checkOut,
  employeePhotoUrl,
  fetchEmployees,
  fetchTodayAttendance,
  formatTime,
} from "@/lib/attendance";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PrintBall Attendance" },
      { name: "description", content: "PrintBall staff attendance station." },
    ],
  }),
  component: AttendancePage,
});

function AttendancePage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<{ employee: Employee; mode: "in" | "out" } | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(new Date());

  const employeesQuery = useQuery({ queryKey: ["employees"], queryFn: () => fetchEmployees() });
  const todayQuery = useQuery({
    queryKey: ["attendance", "today"],
    queryFn: fetchTodayAttendance,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    void supabase.auth.getSession().then(({ data }) => setAuthenticated(Boolean(data.session)));
    return () => window.clearInterval(timer);
  }, []);

  const openRows = useMemo(() => {
    const map = new Map<string, AttendanceRow>();
    for (const row of todayQuery.data ?? []) {
      if (row.status !== "cleared" && !row.check_out_at && !map.has(row.employee_id)) map.set(row.employee_id, row);
    }
    return map;
  }, [todayQuery.data]);

  const lastDone = useMemo(() => {
    const map = new Map<string, AttendanceRow>();
    for (const row of todayQuery.data ?? []) {
      if (row.status !== "cleared" && row.check_out_at && !map.has(row.employee_id)) map.set(row.employee_id, row);
    }
    return map;
  }, [todayQuery.data]);

  const employees = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = employeesQuery.data ?? [];
    if (!term) return list;
    return list.filter(
      (employee) =>
        employee.name.toLowerCase().includes(term) ||
        (employee.role ?? "").toLowerCase().includes(term) ||
        (employee.phone ?? "").includes(term),
    );
  }, [employeesQuery.data, search]);

  const presentCount = openRows.size + lastDone.size;

  async function handleConfirm(photo: Blob | null) {
    if (!target) return;
    setBusy(true);
    try {
      if (target.mode === "in") {
        await checkIn(target.employee.id, photo);
        toast.success(`${target.employee.name} is checked in`);
      } else {
        const row = openRows.get(target.employee.id);
        if (!row) throw new Error("No open check-in found");
        await checkOut(row, photo);
        toast.success(`${target.employee.name} is checked out`);
      }
      await queryClient.invalidateQueries({ queryKey: ["attendance"] });
      setTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save attendance");
    } finally {
      setBusy(false);
    }
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
            <Link to="/" className="inline-flex h-10 items-center gap-2 rounded-xl bg-white/10 px-3.5 text-sm font-semibold text-white ring-1 ring-white/10 transition hover:bg-white/15">
              <ShieldCheck className="size-4" />
              <span className="hidden sm:inline">Attendance screen</span>
            </Link>
            {authenticated ? (
              <Button variant="ghost" className="h-10 rounded-xl px-3.5 text-white hover:bg-white/10 hover:text-white" onClick={async () => { await supabase.auth.signOut(); setAuthenticated(false); }}>
                <LogOut className="size-4" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            ) : (
              <Button asChild className="h-10 rounded-xl bg-primary px-3.5 text-primary-foreground shadow-sm hover:bg-primary/90">
                <Link to="/auth"><ShieldCheck className="size-4" /><span className="hidden sm:inline">Admin</span></Link>
              </Button>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-10">
        <section className="mb-7 flex flex-col gap-5 rounded-[1.5rem] border bg-card p-5 shadow-card sm:p-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-primary">Attendance station</p>
            <h1 className="text-3xl sm:text-4xl">Mark your attendance</h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
              Find your name, check in when you arrive, and check out when you leave.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border bg-background px-4 py-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground"><Clock className="size-5" /></div>
            <div>
              <p className="font-display text-xl leading-none">{now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</p>
              <p className="mt-1 text-xs text-muted-foreground">{now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}</p>
            </div>
          </div>
        </section>

        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employee by name, role or phone…" className="h-14 rounded-2xl border bg-card pl-12 text-base shadow-sm" />
          </div>
          <div className="flex h-14 items-center gap-2 rounded-2xl border bg-card px-4 text-sm text-muted-foreground shadow-sm">
            <Users className="size-4" />
            <span><strong className="text-foreground">{presentCount}</strong> present today</span>
          </div>
        </div>

        {employeesQuery.isLoading ? (
          <div className="rounded-2xl border bg-card py-20 text-center text-muted-foreground">Loading staff…</div>
        ) : employees.length === 0 ? (
          <div className="rounded-2xl border bg-card py-20 text-center text-muted-foreground">No employees match your search.</div>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {employees.map((employee) => {
              const open = openRows.get(employee.id);
              const done = lastDone.get(employee.id);
              const photo = employeePhotoUrl(employee.photo_path);
              return (
                <li key={employee.id} className="group overflow-hidden rounded-[1.35rem] border bg-card shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-lg">
                  <div className="p-5">
                    <div className="flex items-center gap-4">
                      {photo ? <img src={photo} alt={employee.name} className="size-16 shrink-0 rounded-2xl object-cover ring-1 ring-border" /> : <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-accent font-display text-2xl text-accent-foreground">{employee.name.slice(0, 1).toUpperCase()}</div>}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-lg font-semibold">{employee.name}</p>
                        <p className="truncate text-sm text-muted-foreground">{employee.role || "Staff member"}</p>
                        {open ? (
                          <Badge variant="secondary" className="mt-2 gap-1 rounded-full bg-success/10 text-success ring-1 ring-success/20"><span className="size-1.5 rounded-full bg-success" /> In since {formatTime(open.check_in_at)}</Badge>
                        ) : done ? (
                          <Badge variant="outline" className="mt-2 rounded-full">Completed · {formatTime(done.check_out_at)}</Badge>
                        ) : (
                          <Badge variant="outline" className="mt-2 rounded-full">Not checked in</Badge>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-2">
                      {open ? (
                        <Button onClick={() => setTarget({ employee, mode: "out" })} className="h-12 rounded-xl" variant="outline"><LogOut /> Check out</Button>
                      ) : done ? (
                        <div className="flex h-12 items-center justify-center gap-2 rounded-xl bg-success/10 text-sm font-semibold text-success ring-1 ring-success/20"><Check className="size-4" /> Completed today</div>
                      ) : (
                        <Button onClick={() => setTarget({ employee, mode: "in" })} className="h-12 rounded-xl"><LogIn /> Check in</Button>
                      )}
                      <div className="flex items-center justify-center rounded-xl bg-muted/60 px-3 text-center text-xs text-muted-foreground">{open ? "Your shift is active" : done ? "Ready for another shift" : "Ready to start"}</div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <Dialog open={target !== null} onOpenChange={(open) => !open && !busy && setTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{target?.mode === "out" ? "Check out" : "Check in"} · {target?.employee.name}</DialogTitle></DialogHeader>
          {target && <AttendanceCamera key={`${target.employee.id}-${target.mode}`} employeeName={target.employee.name} mode={target.mode} busy={busy} onCancel={() => setTarget(null)} onConfirm={handleConfirm} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
