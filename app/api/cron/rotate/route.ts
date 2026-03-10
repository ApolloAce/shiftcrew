import { NextResponse } from "next/server";
import { query, execute, mysqlNow } from "@/lib/mysql";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CRON_SECRET = process.env.CRON_SECRET || "shiftcrew-cron-2026";

// ─── Date Helpers ────────────────────────────────────────────────────────────

function formatDateLocal(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getWeekBounds(date: Date) {
  const d = new Date(date);
  const dow = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - dow + (dow === 0 ? -6 : 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { monday, sunday, mondayISO: formatDateLocal(monday), sundayISO: formatDateLocal(sunday) };
}

function getShiftTimes(shift: string): { shiftStart: string; shiftEnd: string } {
  switch (shift?.toUpperCase()) {
    case "PM": return { shiftStart: "14:00", shiftEnd: "22:00" };
    case "AM":
    default:   return { shiftStart: "07:00", shiftEnd: "22:00" };
  }
}

function getWeekDates(monday: Date): string[] {
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(formatDateLocal(d));
  }
  return dates;
}

// ─── Shuffle ─────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Group assignments by branch ─────────────────────────────────────────────

function groupAssignmentsByBranch(assignments: any[]) {
  const map = new Map<string, any>();
  for (const a of assignments) {
    if (!map.has(a.branchId)) {
      map.set(a.branchId, { branchId: a.branchId, branchName: a.branchName || a.branchId, employees: [] });
    }
    map.get(a.branchId)!.employees.push({
      employeeId: a.employeeId, employeeName: a.employeeName, isPresent: false,
      isManual: a.isManual || false, shift: a.shift, shiftStart: a.shiftStart, shiftEnd: a.shiftEnd,
    });
  }
  return Array.from(map.values());
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface Employee { id: string; firstName: string; surname: string; branchId: string | null }
interface Branch   { id: string; branchName: string; maxCapacity: number | null }
interface ManualOverride { employeeId: string; employeeName: string; overrideBranchId: string; overrideBranchName: string; shift: string | null; date: string }
interface LeaveRecord    { employeeId: string; startDate: string; endDate: string }
interface HistoryRecord  { employeeId: string; branchId: string; branchName: string; weekStart: string }
interface Assignment     { employeeId: string; employeeName: string; branchId: string; branchName: string; shift: string; shiftStart: string; shiftEnd: string; isManual: boolean }

// ─── STEP 1: Approved Leaves ─────────────────────────────────────────────────

async function fetchApprovedLeaves(mondayISO: string, sundayISO: string): Promise<LeaveRecord[]> {
  return query<LeaveRecord>(
    `SELECT employeeId, startDate, endDate FROM leave_requests
     WHERE status = 'approved' AND startDate <= ? AND endDate >= ?`,
    [sundayISO, mondayISO]
  );
}

// ─── STEP 2: Manual Overrides ────────────────────────────────────────────────

async function fetchManualOverrides(mondayISO: string, sundayISO: string): Promise<ManualOverride[]> {
  return query<ManualOverride>(
    `SELECT employeeId, employeeName, overrideBranchId, overrideBranchName, shift, date
     FROM manual_overrides WHERE date >= ? AND date <= ? ORDER BY date`,
    [mondayISO, sundayISO]
  );
}

// ─── STEP 3: Branch History ──────────────────────────────────────────────────

async function fetchBranchHistory(numWeeks: number): Promise<HistoryRecord[]> {
  const limit = Math.max(1, Math.floor(numWeeks * 200));
  return query<HistoryRecord>(
    `SELECT employeeId, branchId, branchName, weekStart
     FROM employee_branch_history ORDER BY weekStart DESC LIMIT ${limit}`
  );
}

function buildHistoryMap(history: HistoryRecord[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const h of history) {
    if (!map[h.employeeId]) map[h.employeeId] = [];
    map[h.employeeId].push(h.branchName);
  }
  return map;
}

// ─── STEP 4: Fair Rotation Algorithm ─────────────────────────────────────────

function generateFairRotation(
  employees: Employee[],
  branches: Branch[],
  historyMap: Record<string, string[]>,
  manualOverrides: ManualOverride[],
  fullWeekLeaveIds: Set<string>,
): Assignment[] {
  if (!employees.length || !branches.length) return [];

  // ── Pre-seed manual assignments ──
  const manualAssignments: Assignment[] = [];
  const manualEmployeeIds = new Set(manualOverrides.map((o) => o.employeeId));
  const seenManual = new Set<string>();
  for (const mo of manualOverrides) {
    if (seenManual.has(mo.employeeId)) continue;
    seenManual.add(mo.employeeId);
    const shift = mo.shift || "AM";
    manualAssignments.push({
      employeeId: mo.employeeId, employeeName: mo.employeeName,
      branchId: mo.overrideBranchId, branchName: mo.overrideBranchName,
      shift, isManual: true, ...getShiftTimes(shift),
    });
  }

  // ── Filter: exclude full-week leave + manual employees ──
  const autoPool = employees.filter(
    (e) => !fullWeekLeaveIds.has(String(e.id)) && !manualEmployeeIds.has(String(e.id))
  );
  if (autoPool.length === 0) return manualAssignments;

  // ── Calculate slots per branch ──
  const branchManualCount: Record<string, number> = {};
  for (const ma of manualAssignments) {
    branchManualCount[ma.branchId] = (branchManualCount[ma.branchId] || 0) + 1;
  }

  const totalAll = autoPool.length + manualAssignments.length;
  const basePerBranch = Math.floor(totalAll / branches.length);
  let remainderSlots = totalAll % branches.length;
  const shuffledBranches = shuffle(branches);
  const availableSlots: Record<string, number> = {};

  for (const b of shuffledBranches) {
    const desired = basePerBranch + (remainderSlots > 0 ? 1 : 0);
    if (remainderSlots > 0) remainderSlots--;
    const capped = b.maxCapacity ? Math.min(desired, b.maxCapacity) : desired;
    availableSlots[b.id] = Math.max(0, capped - (branchManualCount[b.id] || 0));
  }

  // ── Score-based assignment ──
  const shuffledPool = shuffle(autoPool);
  const autoAssignments: Assignment[] = [];

  for (const emp of shuffledPool) {
    const empId = String(emp.id);
    const recentBranches = historyMap[empId] || [];

    const scored = branches
      .map((b) => {
        let score = 0;
        const slots = availableSlots[b.id] || 0;
        if (recentBranches.length > 0 && recentBranches[0] === b.branchName) score += 100;
        if (recentBranches.length > 1 && recentBranches[1] === b.branchName) score += 50;
        for (let i = 2; i < recentBranches.length; i++) {
          if (recentBranches[i] === b.branchName) score += Math.max(1, 10 - i * 2);
        }
        if (slots <= 0) score += 10000;
        return { branch: b, score, slots };
      })
      .sort((a, b) => a.score - b.score);

    const bestScore = scored[0].score;
    const ties = scored.filter((s) => s.score === bestScore && s.slots > 0);
    const pick = ties.length > 0
      ? ties[Math.floor(Math.random() * ties.length)]
      : scored.find((s) => s.slots > 0) || scored[0];

    const shift = "AM";
    autoAssignments.push({
      employeeId: empId, employeeName: `${emp.firstName} ${emp.surname}`,
      branchId: pick.branch.id, branchName: pick.branch.branchName,
      shift, isManual: false, ...getShiftTimes(shift),
    });
    availableSlots[pick.branch.id] = Math.max(0, (availableSlots[pick.branch.id] || 0) - 1);
  }

  return [...manualAssignments, ...autoAssignments];
}

// ─── STEP 5: Persistence Helpers ─────────────────────────────────────────────

async function saveRotationHistory(assignments: Assignment[], weekStartISO: string, rotationId: string): Promise<number> {
  let count = 0;
  const now = mysqlNow();
  for (const a of assignments) {
    try {
      await execute(
        `INSERT INTO employee_branch_history (id, employeeId, branchId, branchName, weekStart, isManual, rotationId, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE branchId = VALUES(branchId), branchName = VALUES(branchName), isManual = VALUES(isManual), rotationId = VALUES(rotationId)`,
        [crypto.randomUUID(), a.employeeId, a.branchId, a.branchName, weekStartISO, a.isManual ? 1 : 0, rotationId, now]
      );
      count++;
    } catch (err) {
      console.error(`[Cron Rotate] History save failed for ${a.employeeId}:`, err);
    }
  }
  return count;
}

async function createRotationLog(weekStart: string, weekEnd: string, triggeredBy: string): Promise<string> {
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO rotation_log (id, weekStart, weekEnd, triggeredBy, createdAt) VALUES (?, ?, ?, ?, ?)`,
    [id, weekStart, weekEnd, triggeredBy, mysqlNow()]
  );
  return id;
}

async function finalizeRotationLog(rotationId: string, data: {
  totalEmployees: number; totalBranches: number; assignedCount: number;
  onLeaveCount: number; manualCount: number; skippedDays: number;
  status: string; details: any; elapsed: string;
}): Promise<void> {
  await execute(
    `UPDATE rotation_log SET totalEmployees=?, totalBranches=?, assignedCount=?,
     onLeaveCount=?, manualCount=?, skippedDays=?, status=?, details=?, elapsed=? WHERE id=?`,
    [data.totalEmployees, data.totalBranches, data.assignedCount,
     data.onLeaveCount, data.manualCount, data.skippedDays,
     data.status, JSON.stringify(data.details), data.elapsed, rotationId]
  );
}

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

/**
 * GET /api/cron/rotate?secret=xxx[&force=true][&dryrun=true]
 *
 * Enhanced v2 rotation with:
 *  - Approved-leave exclusion  (Scenario 2)
 *  - Manual-override pre-seeding  (Scenario 1)
 *  - History-based fairness scoring  (Scenario 3)
 *  - Conflict prevention  (Scenario 4)
 *  - Full audit logging  (Scenario 5)
 */
export async function GET(req: Request) {
  const startTime = Date.now();
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  const force = url.searchParams.get("force") === "true";
  const dryrun = url.searchParams.get("dryrun") === "true";

  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const dayOfWeek = now.getDay();

    if (dayOfWeek !== 1 && !force) {
      return NextResponse.json({
        status: "skipped",
        reason: `Today is ${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dayOfWeek]}, not Monday. Use force=true to override.`,
        dayOfWeek,
      });
    }

    const { monday, sundayISO, mondayISO } = getWeekBounds(now);

    // Check for existing auto-generated schedules
    const existing = await query(
      "SELECT id FROM schedules WHERE weekStart = ? AND (manuallyScheduled = 0 OR manuallyScheduled IS NULL) LIMIT 1",
      [mondayISO]
    );
    if (existing.length > 0 && !force) {
      return NextResponse.json({
        status: "skipped",
        reason: `Auto-rotation schedules already exist for week ${mondayISO} – ${sundayISO}. Use force=true to override.`,
      });
    }

    // ── Fetch all data in parallel ──
    const [employees, branches, approvedLeaves, manualOverrides] = await Promise.all([
      query<Employee>(
        "SELECT id, firstName, surname, branchId FROM users WHERE role='employee' AND (archived=0 OR archived IS NULL) AND status='approved'"
      ),
      query<Branch>("SELECT id, branchName, maxCapacity FROM branches ORDER BY branchName"),
      fetchApprovedLeaves(mondayISO, sundayISO),
      fetchManualOverrides(mondayISO, sundayISO),
    ]);

    if (!employees.length) return NextResponse.json({ status: "skipped", reason: "No active employees found." });
    if (!branches.length)  return NextResponse.json({ status: "skipped", reason: "No branches found." });

    // Fetch history (needs branch count)
    const historyRecords = await fetchBranchHistory(Math.max(branches.length, 5));

    const employeeList = employees.map((e) => ({ ...e, id: String(e.id) }));
    const branchList   = branches.map((b) => ({ ...b, id: String(b.id) }));

    // ── Categorize leaves ──
    const fullWeekLeaveIds = new Set<string>();
    const partialLeaves: LeaveRecord[] = [];
    for (const lv of approvedLeaves) {
      if (lv.startDate <= mondayISO && lv.endDate >= sundayISO) {
        fullWeekLeaveIds.add(lv.employeeId);
      } else {
        partialLeaves.push(lv);
      }
    }

    const historyMap = buildHistoryMap(historyRecords);

    // ── Generate rotation ──
    const assignments = generateFairRotation(employeeList, branchList, historyMap, manualOverrides, fullWeekLeaveIds);

    if (!assignments.length) {
      return NextResponse.json({ status: "error", reason: "Rotation produced no assignments." });
    }

    // ── Build summary ──
    const branchSummary: Record<string, string[]> = {};
    for (const a of assignments) {
      if (!branchSummary[a.branchName]) branchSummary[a.branchName] = [];
      branchSummary[a.branchName].push(`${a.employeeName}${a.isManual ? " (manual)" : ""}`);
    }

    const onLeaveNames = employeeList
      .filter((e) => fullWeekLeaveIds.has(e.id))
      .map((e) => `${e.firstName} ${e.surname}`);

    const manualCount = assignments.filter((a) => a.isManual).length;
    const weekDates = getWeekDates(monday);

    // ── Dry-run ──
    if (dryrun) {
      return NextResponse.json({
        status: "dryrun", weekStart: mondayISO, weekEnd: sundayISO,
        totalEmployees: employees.length, totalBranches: branches.length,
        assignments: assignments.length, manualCount,
        onLeaveCount: fullWeekLeaveIds.size, onLeaveNames,
        branchSummary, elapsed: `${Date.now() - startTime}ms`,
      });
    }

    // ── Audit log ──
    const triggeredBy = force ? "force" : "cron";
    const rotationId = await createRotationLog(mondayISO, sundayISO, triggeredBy);

    // ── Delete old auto-generated schedules ──
    await execute(
      "DELETE FROM schedules WHERE weekStart = ? AND (manuallyScheduled = 0 OR manuallyScheduled IS NULL)",
      [mondayISO]
    );

    // ── Save 7 schedule documents (per-day leave + override adjustments) ──
    const nowStr = mysqlNow();
    let savedCount = 0;
    let skippedDays = 0;

    for (let i = 0; i < 7; i++) {
      const dayISO = weekDates[i];

      // Skip days with manually-scheduled entries
      const manualSchedule = await query(
        "SELECT id FROM schedules WHERE scheduleFor = ? AND manuallyScheduled = 1 LIMIT 1",
        [dayISO]
      );
      if (manualSchedule.length > 0) { skippedDays++; continue; }

      // Build per-day assignments: start from weekly, apply adjustments
      let dayAssignments = [...assignments];

      // Remove employees on partial leave THIS day
      const onLeaveToday = new Set<string>();
      for (const lv of partialLeaves) {
        if (lv.startDate <= dayISO && lv.endDate >= dayISO) onLeaveToday.add(lv.employeeId);
      }
      if (onLeaveToday.size > 0) {
        dayAssignments = dayAssignments.filter((a) => !onLeaveToday.has(a.employeeId));
      }

      // Apply per-day manual overrides
      const dayOverrides = manualOverrides.filter((o) => o.date === dayISO);
      for (const dmo of dayOverrides) {
        dayAssignments = dayAssignments.filter((a) => a.employeeId !== dmo.employeeId);
        const shift = dmo.shift || "AM";
        dayAssignments.push({
          employeeId: dmo.employeeId, employeeName: dmo.employeeName,
          branchId: dmo.overrideBranchId, branchName: dmo.overrideBranchName,
          shift, isManual: true, ...getShiftTimes(shift),
        });
      }

      const scheduleId = crypto.randomUUID();
      await execute(
        `INSERT INTO schedules (id, date, time, scheduleFor, branchAssignments, assignments, weekStart, weekEnd, manuallyScheduled, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           time=VALUES(time), branchAssignments=VALUES(branchAssignments),
           assignments=VALUES(assignments), weekStart=VALUES(weekStart),
           weekEnd=VALUES(weekEnd), updatedAt=VALUES(updatedAt)`,
        [scheduleId, mondayISO, "07:00", dayISO,
         JSON.stringify(groupAssignmentsByBranch(dayAssignments)),
         JSON.stringify(dayAssignments),
         mondayISO, sundayISO, 0, nowStr, nowStr]
      );
      savedCount++;
    }

    // ── Save rotation history ──
    const historyCount = await saveRotationHistory(assignments, mondayISO, rotationId);

    // ── Update users.branchId (auto-assigned only) ──
    let updatedEmployees = 0;
    for (const a of assignments) {
      if (a.isManual) continue;
      try {
        await execute("UPDATE users SET branchId=?, updatedAt=? WHERE id=?", [a.branchId, nowStr, a.employeeId]);
        updatedEmployees++;
      } catch (err) {
        console.error(`[Cron Rotate] branchId update failed for ${a.employeeId}:`, err);
      }
    }

    // ── Finalize audit log ──
    const elapsed = `${Date.now() - startTime}ms`;
    await finalizeRotationLog(rotationId, {
      totalEmployees: employees.length, totalBranches: branches.length,
      assignedCount: assignments.length, onLeaveCount: fullWeekLeaveIds.size,
      manualCount, skippedDays, status: "success",
      details: { branchSummary, onLeaveNames }, elapsed,
    });

    console.log(`[Cron Rotate] ✓ ${mondayISO}–${sundayISO}: ${savedCount} days, ${assignments.length} assigned, ${fullWeekLeaveIds.size} leave, ${manualCount} manual`);

    return NextResponse.json({
      status: "success", rotationId,
      weekStart: mondayISO, weekEnd: sundayISO,
      schedulesSaved: savedCount, skippedDays,
      employeesUpdated: updatedEmployees,
      totalEmployees: employees.length, totalBranches: branches.length,
      assignments: assignments.length, manualCount,
      onLeaveCount: fullWeekLeaveIds.size, onLeaveNames,
      historyRecorded: historyCount, branchSummary, elapsed,
    });
  } catch (error: any) {
    console.error("[Cron Rotate] Fatal error:", error);
    return NextResponse.json({ status: "error", message: error.message || String(error) }, { status: 500 });
  }
}
