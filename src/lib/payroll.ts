import type { AttendanceRow, Employee } from "./attendance";

export type PayrollSettings = {
  office_start: string;
  office_end: string;
  grace_start_minutes: number;
  grace_end_minutes: number;
  half_day_minutes: number;
  overtime_multiplier: number;
  /** Normal working weekdays. Sunday (0) is optional and, when enabled, is paid as overtime. */
  working_days: number[];
};

export type Holiday = {
  id: string;
  holiday_date: string;
  start_date?: string;
  end_date?: string;
  name: string;
  created_at?: string;
  automatic?: boolean;
};

export type Leave = {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  leave_type: "paid" | "unpaid";
  reason: string | null;
  created_at?: string;
};

export type SalaryDay = {
  date: string;
  label: string;
  status: "present" | "absent" | "cleared" | "holiday" | "paid_leave" | "unpaid_leave" | "not_joined" | "upcoming" | "off";
  checkIn: string | null;
  checkOut: string | null;
  workedMinutes: number;
  lateMinutes: number;
  overtimeMinutes: number;
  basePay: number;
  lateDeduction: number;
  overtimePay: number;
};

export type SalarySummary = {
  employee: Employee;
  month: string;
  monthLabel: string;
  monthlySalary: number;
  calendarDays: number;
  elapsedCalendarDays: number;
  dailyRate: number;
  perMinuteRate: number;
  scheduledDays: number;
  presentDays: number;
  halfDays: number;
  absentDays: number;
  clearedDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  holidayDays: number;
  workedMinutes: number;
  lateMinutes: number;
  overtimeMinutes: number;
  basePay: number;
  lateDeduction: number;
  halfDayDeduction: number;
  absenceDeduction: number;
  unpaidLeaveDeduction: number;
  overtimePay: number;
  netSalary: number;
  days: SalaryDay[];
};

export const DEFAULT_PAYROLL_SETTINGS: PayrollSettings = {
  office_start: "10:00",
  office_end: "19:00",
  grace_start_minutes: 0,
  grace_end_minutes: 0,
  half_day_minutes: 270,
  overtime_multiplier: 1,
  // Sunday is deliberately excluded by default. If an admin enables it,
  // Sunday attendance is paid minute-by-minute as overtime rather than
  // becoming an absence if nobody works that day.
  working_days: [1, 2, 3, 4, 5, 6],
};

function dateObj(key: string) {
  return new Date(`${key}T00:00:00+05:30`);
}

function parseKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function daysBetweenInclusive(start: string, end: string) {
  if (start > end) return 0;
  return Math.floor((parseKey(end) - parseKey(start)) / 86400000) + 1;
}

export function monthBounds(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = `${month}-01`;
  const next = new Date(Date.UTC(year, monthNumber, 1));
  return { start, end: `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01` };
}

export function monthDates(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from({ length: days }, (_, i) => {
    const day = i + 1;
    const key = `${month}-${String(day).padStart(2, "0")}`;
    const date = dateObj(key);
    return { key, day, weekday: date.getDay() };
  });
}

function minutesFromTime(time: string) {
  const [hours, minutes] = time.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function localMinutes(value: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Format a number of minutes for payroll/attendance displays. */
export function minutesLabel(totalMinutes: number) {
  const minutes = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${String(remainder).padStart(2, "0")}m`;
}

/** Format Indian-rupee amounts consistently across payroll screens. */
export function money(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function holidayForDate(holidays: Holiday[], date: string) {
  return holidays.find((holiday) => {
    const start = holiday.start_date ?? holiday.holiday_date;
    const end = holiday.end_date ?? holiday.holiday_date;
    return start <= date && end >= date;
  });
}

function leaveForDate(leaves: Leave[], date: string) {
  return leaves.find((leave) => leave.start_date <= date && leave.end_date >= date);
}

/** India's three gazetted national days. Festival/regional holidays can be added as custom ranges. */
export function getIndiaNationalHolidays(year: number): Holiday[] {
  return [
    { id: `national-${year}-01-26`, holiday_date: `${year}-01-26`, start_date: `${year}-01-26`, end_date: `${year}-01-26`, name: "Republic Day", automatic: true },
    { id: `national-${year}-08-15`, holiday_date: `${year}-08-15`, start_date: `${year}-08-15`, end_date: `${year}-08-15`, name: "Independence Day", automatic: true },
    { id: `national-${year}-10-02`, holiday_date: `${year}-10-02`, start_date: `${year}-10-02`, end_date: `${year}-10-02`, name: "Gandhi Jayanti", automatic: true },
  ];
}

export function getAutomaticNationalHolidaysForMonth(month: string) {
  return getIndiaNationalHolidays(Number(month.slice(0, 4)));
}

/**
 * Payroll model:
 *
 * 1. The monthly salary is spread across ALL calendar days in the month.
 *    30-day month  -> salary / 30
 *    31-day month  -> salary / 31
 *    Feb (normal)  -> salary / 28
 *    Feb (leap)    -> salary / 29
 *
 * 2. The daily rate is stable for that employee/month and never changes
 *    because of holidays, Sundays, or how many working days happen to exist.
 *
 * 3. One minute is daily rate / configured office working minutes.
 *    Late deductions and overtime therefore use the same stable minute rate.
 *
 * 4. For a current month, only calendar days from joining date through today
 *    have accrued. For a completed month, all calendar days from joining date
 *    through month-end have accrued. This prevents someone who joined today
 *    from receiving the whole monthly salary as a one-day payout.
 *
 * 5. Sundays are weekly-off by default. If Sunday is enabled in working_days,
 *    an actual Sunday attendance is treated as overtime for every worked minute.
 *    A missing Sunday never creates an absence deduction.
 */
export function calculateSalary(
  employee: Employee,
  month: string,
  attendance: AttendanceRow[],
  holidays: Holiday[],
  leaves: Leave[],
  settings: PayrollSettings,
  todayKey: string,
): SalarySummary {
  const dates = monthDates(month);
  const monthStart = dates[0]?.key ?? `${month}-01`;
  const monthEnd = dates.at(-1)?.key ?? monthStart;
  const calendarDays = dates.length;
  const effectiveToday = todayKey < monthStart ? "0000-00-00" : todayKey > monthEnd ? monthEnd : todayKey;
  const joinDate = employee.join_date || monthStart;
  const workingDays = Array.isArray(settings.working_days)
    ? settings.working_days.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    : DEFAULT_PAYROLL_SETTINGS.working_days;
  const officeStart = typeof settings.office_start === "string" ? settings.office_start.slice(0, 5) : DEFAULT_PAYROLL_SETTINGS.office_start;
  const officeEnd = typeof settings.office_end === "string" ? settings.office_end.slice(0, 5) : DEFAULT_PAYROLL_SETTINGS.office_end;
  const graceStartMinutes = Math.max(0, Number(settings.grace_start_minutes) || 0);
  const graceEndMinutes = Math.max(0, Number(settings.grace_end_minutes) || 0);
  const overtimeMultiplier = Math.max(0, Number(settings.overtime_multiplier) || 0);
  const elapsedStart = joinDate > monthStart ? joinDate : monthStart;
  const elapsedCalendarDays = effectiveToday === "0000-00-00" ? 0 : daysBetweenInclusive(elapsedStart, effectiveToday);

  const dailyRate = Number(employee.monthly_salary ?? 0) / Math.max(calendarDays, 1);
  const scheduledMinutes = Math.max(1, minutesFromTime(officeEnd) - minutesFromTime(officeStart));
  const perMinuteRate = dailyRate / scheduledMinutes;

  const holidayMap = new Map<string, Holiday>();
  for (const holiday of holidays) {
    const start = holiday.start_date ?? holiday.holiday_date;
    const end = holiday.end_date ?? holiday.holiday_date;
    for (const item of dates) {
      if (start <= item.key && end >= item.key) holidayMap.set(item.key, holiday);
    }
  }

  const attendanceMap = new Map<string, AttendanceRow>();
  for (const row of attendance) attendanceMap.set(row.work_date, row);

  // Normal scheduled working days, excluding holidays and Sunday (unless the
  // admin explicitly enables Sunday in working_days). This metric is for the
  // receipt only; the daily-rate denominator is ALWAYS calendar days.
  const scheduledDays = dates.filter((item) =>
    item.key >= joinDate &&
    item.key <= effectiveToday &&
    item.weekday !== 0 &&
    workingDays.includes(item.weekday) &&
    !holidayMap.has(item.key),
  ).length;

  let presentDays = 0;
  let halfDays = 0;
  let absentDays = 0;
  let clearedDays = 0;
  let paidLeaveDays = 0;
  let unpaidLeaveDays = 0;
  let holidayDays = 0;
  let workedMinutes = 0;
  let lateMinutes = 0;
  let overtimeMinutes = 0;
  let lateDeduction = 0;
  let halfDayDeduction = 0;
  let absenceDeduction = 0;
  let unpaidLeaveDeduction = 0;
  let overtimePay = 0;

  const dayRows: SalaryDay[] = dates.map((item) => {
    const label = dateObj(item.key).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    const notJoined = item.key < joinDate;
    const future = item.key > effectiveToday && effectiveToday !== "0000-00-00";

    if (notJoined) {
      return { date: item.key, label, status: "not_joined", checkIn: null, checkOut: null, workedMinutes: 0, lateMinutes: 0, overtimeMinutes: 0, basePay: 0, lateDeduction: 0, overtimePay: 0 };
    }

    if (effectiveToday === "0000-00-00" || future) {
      return { date: item.key, label, status: "upcoming", checkIn: null, checkOut: null, workedMinutes: 0, lateMinutes: 0, overtimeMinutes: 0, basePay: 0, lateDeduction: 0, overtimePay: 0 };
    }

    const holiday = holidayForDate(holidays, item.key);
    const isSunday = item.weekday === 0;
    const sundayEnabled = workingDays.includes(0);
    const normalWorkingDay = workingDays.includes(item.weekday) && !isSunday;
    const sundayWorkDay = isSunday && sundayEnabled;
    const row = attendanceMap.get(item.key);

    // Sunday is a weekly holiday by default. When Sunday OT is enabled in the
    // policy, actual Sunday attendance is paid minute-by-minute as overtime.
    // A missing Sunday never creates an absence deduction.
    if (isSunday) {
      if (!sundayEnabled) {
        return { date: item.key, label, status: "off", checkIn: null, checkOut: null, workedMinutes: 0, lateMinutes: 0, overtimeMinutes: 0, basePay: 0, lateDeduction: 0, overtimePay: 0 };
      }
      if (!row || row.status === "cleared") {
        if (row?.status === "cleared") clearedDays += 1;
        return { date: item.key, label, status: row?.status === "cleared" ? "cleared" : "off", checkIn: row?.check_in_at ?? null, checkOut: row?.check_out_at ?? null, workedMinutes: 0, lateMinutes: 0, overtimeMinutes: 0, basePay: 0, lateDeduction: 0, overtimePay: 0 };
      }
      const worked = row.check_out_at ? Math.max(0, Math.round((new Date(row.check_out_at).getTime() - new Date(row.check_in_at).getTime()) / 60000)) : 0;
      const sundayPay = worked * perMinuteRate * Math.max(0, overtimeMultiplier);
      presentDays += 1;
      workedMinutes += worked;
      overtimeMinutes += worked;
      overtimePay += sundayPay;
      return { date: item.key, label, status: "present", checkIn: row.check_in_at, checkOut: row.check_out_at, workedMinutes: worked, lateMinutes: 0, overtimeMinutes: worked, basePay: 0, lateDeduction: 0, overtimePay: sundayPay };
    }
    if (holiday) {
      holidayDays += 1;
      // Holiday pay is already part of the calendar-day accrual. There is no
      // separate base-pay addition here, preventing double payment.
      if (!row || row.status === "cleared") {
        if (row?.status === "cleared") clearedDays += 1;
        return { date: item.key, label, status: row?.status === "cleared" ? "cleared" : "holiday", checkIn: row?.check_in_at ?? null, checkOut: row?.check_out_at ?? null, workedMinutes: 0, lateMinutes: 0, overtimeMinutes: 0, basePay: 0, lateDeduction: 0, overtimePay: 0 };
      }
    }

    if (isSunday && sundayWorkDay) {
      if (!row || row.status === "cleared") {
        if (row?.status === "cleared") clearedDays += 1;
        return { date: item.key, label, status: row?.status === "cleared" ? "cleared" : "off", checkIn: row?.check_in_at ?? null, checkOut: row?.check_out_at ?? null, workedMinutes: 0, lateMinutes: 0, overtimeMinutes: 0, basePay: 0, lateDeduction: 0, overtimePay: 0 };
      }
      const worked = row.check_out_at ? Math.max(0, Math.round((new Date(row.check_out_at).getTime() - new Date(row.check_in_at).getTime()) / 60000)) : 0;
      const sundayPay = worked * perMinuteRate * Math.max(0, overtimeMultiplier);
      presentDays += 1;
      workedMinutes += worked;
      overtimeMinutes += worked;
      overtimePay += sundayPay;
      return { date: item.key, label, status: "present", checkIn: row.check_in_at, checkOut: row.check_out_at, workedMinutes: worked, lateMinutes: 0, overtimeMinutes: worked, basePay: 0, lateDeduction: 0, overtimePay: sundayPay };
    }

    if (!normalWorkingDay) {
      if (row?.status === "present") {
        const worked = row.check_out_at ? Math.max(0, Math.round((new Date(row.check_out_at).getTime() - new Date(row.check_in_at).getTime()) / 60000)) : 0;
        const sundayPay = isSunday ? worked * perMinuteRate * Math.max(0, overtimeMultiplier) : 0;
        presentDays += 1;
        workedMinutes += worked;
        overtimeMinutes += sundayPay > 0 ? worked : 0;
        overtimePay += sundayPay;
        return { date: item.key, label, status: "present", checkIn: row.check_in_at, checkOut: row.check_out_at, workedMinutes: worked, lateMinutes: 0, overtimeMinutes: sundayPay > 0 ? worked : 0, basePay: 0, lateDeduction: 0, overtimePay: sundayPay };
      }
      return { date: item.key, label, status: "off", checkIn: null, checkOut: null, workedMinutes: 0, lateMinutes: 0, overtimeMinutes: 0, basePay: 0, lateDeduction: 0, overtimePay: 0 };
    }

    const leave = leaveForDate(leaves, item.key);
    if (leave) {
      if (leave.leave_type === "paid") {
        paidLeaveDays += 1;
        return { date: item.key, label, status: "paid_leave", checkIn: null, checkOut: null, workedMinutes: 0, lateMinutes: 0, overtimeMinutes: 0, basePay: 0, lateDeduction: 0, overtimePay: 0 };
      }
      unpaidLeaveDays += 1;
      unpaidLeaveDeduction += dailyRate;
      return { date: item.key, label, status: "unpaid_leave", checkIn: null, checkOut: null, workedMinutes: 0, lateMinutes: 0, overtimeMinutes: 0, basePay: 0, lateDeduction: 0, overtimePay: 0 };
    }

    if (row?.status === "cleared") {
      clearedDays += 1;
      return { date: item.key, label, status: "cleared", checkIn: row.check_in_at, checkOut: row.check_out_at, workedMinutes: 0, lateMinutes: 0, overtimeMinutes: 0, basePay: 0, lateDeduction: 0, overtimePay: 0 };
    }

    if (!row) {
      absentDays += 1;
      absenceDeduction += dailyRate;
      return { date: item.key, label, status: "absent", checkIn: null, checkOut: null, workedMinutes: 0, lateMinutes: 0, overtimeMinutes: 0, basePay: 0, lateDeduction: 0, overtimePay: 0 };
    }

    presentDays += 1;
    const worked = row.check_out_at ? Math.max(0, Math.round((new Date(row.check_out_at).getTime() - new Date(row.check_in_at).getTime()) / 60000)) : 0;
    const halfDayMinutes = Math.max(1, Number(settings.half_day_minutes) || DEFAULT_PAYROLL_SETTINGS.half_day_minutes);
    const half = worked > 0 && worked < halfDayMinutes;
    if (half) {
      halfDays += 1;
      halfDayDeduction += dailyRate * 0.5;
    }

    const openingMinutes = minutesFromTime(officeStart);
    const closingMinutes = minutesFromTime(officeEnd);
    const late = Math.max(0, localMinutes(row.check_in_at) - openingMinutes - graceStartMinutes);
    const overtime = row.check_out_at
      ? Math.max(0, localMinutes(row.check_out_at) - closingMinutes - graceEndMinutes)
      : 0;
    const maxLateDeduction = dailyRate * (half ? 0.5 : 1);
    const lateDed = Math.min(maxLateDeduction, late * perMinuteRate);
    const overtimeAmount = overtime * perMinuteRate * Math.max(0, overtimeMultiplier);

    workedMinutes += worked;
    lateMinutes += late;
    overtimeMinutes += overtime;
    lateDeduction += lateDed;
    overtimePay += overtimeAmount;

    return {
      date: item.key,
      label,
      status: "present",
      checkIn: row.check_in_at,
      checkOut: row.check_out_at,
      workedMinutes: worked,
      lateMinutes: late,
      overtimeMinutes: overtime,
      basePay: dailyRate * (half ? 0.5 : 1),
      lateDeduction: lateDed,
      overtimePay: overtimeAmount,
    };
  });

  // Calendar accrual is the stable monthly-salary portion. Deductions are
  // applied to that accrued amount. For a completed month this starts at the
  // full monthly salary (unless the employee joined after the first day).
  const basePay = dailyRate * elapsedCalendarDays;
  const totalDeductions = lateDeduction + halfDayDeduction + absenceDeduction + unpaidLeaveDeduction;
  const netSalary = Math.max(0, roundMoney(basePay - totalDeductions + overtimePay));

  return {
    employee,
    month,
    monthLabel: dateObj(`${month}-01`).toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
    monthlySalary: Number(employee.monthly_salary ?? 0),
    calendarDays,
    elapsedCalendarDays,
    dailyRate: roundMoney(dailyRate),
    perMinuteRate: roundMoney(perMinuteRate),
    scheduledDays,
    presentDays,
    halfDays,
    absentDays,
    clearedDays,
    paidLeaveDays,
    unpaidLeaveDays,
    holidayDays,
    workedMinutes,
    lateMinutes,
    overtimeMinutes,
    basePay: roundMoney(basePay),
    lateDeduction: roundMoney(lateDeduction),
    halfDayDeduction: roundMoney(halfDayDeduction),
    absenceDeduction: roundMoney(absenceDeduction),
    unpaidLeaveDeduction: roundMoney(unpaidLeaveDeduction),
    overtimePay: roundMoney(overtimePay),
    netSalary,
    days: dayRows,
  };
}
