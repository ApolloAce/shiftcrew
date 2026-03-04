import { NextResponse } from "next/server";
import { query, execute, mysqlNow } from "@/lib/mysql";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Cron secret to prevent unauthorized access
const CRON_SECRET = process.env.CRON_SECRET || "shiftcrew-cron-2026";

// Helper: format date as YYYY-MM-DD in local timezone
function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Helper: get Monday and Sunday of the week containing the given date
function getWeekBounds(date: Date): { monday: Date; sunday: Date; mondayISO: string; sundayISO: string } {
  const d = new Date(date);
  const dayOfWeek = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    monday,
    sunday,
    mondayISO: formatDateLocal(monday),
    sundayISO: formatDateLocal(sunday),
  };
}

// Helper: get shift times from shift type
function getShiftTimes(shift: string): { shiftStart: string; shiftEnd: string } {
  switch (shift?.toUpperCase()) {
    case "PM": return { shiftStart: "14:00", shiftEnd: "22:00" };
    case "AM":
    default: return { shiftStart: "07:00", shiftEnd: "14:00" };
  }
}

// Fisher-Yates shuffle
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Group flat assignments into branchAssignments
function groupAssignmentsByBranch(assignments: any[]) {
  const map = new Map<string, any>();
  for (const a of assignments) {
    if (!map.has(a.branchId)) {
      map.set(a.branchId, { branchId: a.branchId, branchName: a.branchName || a.branchId, employees: [] });
    }
    map.get(a.branchId)!.employees.push({
      employeeId: a.employeeId,
      employeeName: a.employeeName,
      isPresent: false,
      isManual: a.isManual || false,
      shift: a.shift,
      shiftStart: a.shiftStart,
      shiftEnd: a.shiftEnd,
    });
  }
  return Array.from(map.values());
}

/**
 * Server-side rotation algorithm.
 * - Distributes employees evenly across branches
 * - Shuffles to randomize who goes where
 * - Avoids assigning employees to their current branch when possible
 */
function generateRotation(
  employees: Array<{ id: string; firstName: string; surname: string; currentBranchId: string | null; currentBranchName: string | null }>,
  branches: Array<{ id: string; branchName: string }>,
): Array<{ employeeId: string; employeeName: string; branchId: string; branchName: string; shift: string; shiftStart: string; shiftEnd: string; isManual: boolean }> {
  if (!employees.length || !branches.length) return [];

  const total = employees.length;
  const numBranches = branches.length;
  const base = Math.floor(total / numBranches);
  let remainder = total % numBranches;

  // Shuffle branch order so extra employees go to random branches
  const shuffledBranches = shuffle(branches);

  const desired: Record<string, number> = {};
  for (const b of shuffledBranches) {
    desired[b.branchName] = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
  }

  // Shuffle employees
  const shuffledEmployees = shuffle(employees);

  const results: Array<{ employeeId: string; employeeName: string; branchId: string; branchName: string; shift: string; shiftStart: string; shiftEnd: string; isManual: boolean }> = [];

  for (const emp of shuffledEmployees) {
    // Find candidate branches with available slots, preferring a different branch
    const candidates = branches.filter(
      (b) => (desired[b.branchName] || 0) > 0 && b.branchName !== emp.currentBranchName
    );

    let pick: (typeof branches)[0] | null = null;

    if (candidates.length > 0) {
      pick = candidates[Math.floor(Math.random() * candidates.length)];
    } else {
      // No slot on a different branch — pick any branch with slots
      const fallback = branches.filter((b) => (desired[b.branchName] || 0) > 0);
      if (fallback.length > 0) {
        pick = fallback[Math.floor(Math.random() * fallback.length)];
      } else {
        // All slots filled — force pick a different branch
        const others = branches.filter((b) => b.branchName !== emp.currentBranchName);
        pick = others.length > 0
          ? others[Math.floor(Math.random() * others.length)]
          : branches[Math.floor(Math.random() * branches.length)];
      }
    }

    const shift = "AM";
    results.push({
      employeeId: String(emp.id),
      employeeName: `${emp.firstName} ${emp.surname}`,
      branchId: String(pick.id),
      branchName: pick.branchName,
      shift,
      isManual: false,
      ...getShiftTimes(shift),
    });

    // Reduce desired count
    if (typeof desired[pick.branchName] === "number") {
      desired[pick.branchName] = Math.max(0, desired[pick.branchName] - 1);
    }
  }

  return results;
}

/**
 * GET /api/cron/rotate?secret=xxx[&force=true][&dryrun=true]
 *
 * - Checks if today is Monday (or use force=true to skip day check)
 * - Checks if the current week already has schedules
 * - Generates a new rotation and saves 7 schedule documents (Mon-Sun)
 * - Updates employee branchId in users table
 *
 * Query params:
 *   secret  - must match CRON_SECRET (required)
 *   force   - skip the Monday check (optional)
 *   dryrun  - generate but don't save (optional)
 */
export async function GET(req: Request) {
  const startTime = Date.now();
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  const force = url.searchParams.get("force") === "true";
  const dryrun = url.searchParams.get("dryrun") === "true";

  // Auth check
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

    // Only run on Mondays unless forced
    if (dayOfWeek !== 1 && !force) {
      return NextResponse.json({
        status: "skipped",
        reason: `Today is ${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dayOfWeek]}, not Monday. Use force=true to override.`,
        dayOfWeek,
      });
    }

    const { monday, sunday, mondayISO, sundayISO } = getWeekBounds(now);

    // Check if schedules already exist for this week
    const existingSchedules = await query(
      "SELECT id FROM schedules WHERE weekStart = ? LIMIT 1",
      [mondayISO]
    );

    if (existingSchedules.length > 0 && !force) {
      return NextResponse.json({
        status: "skipped",
        reason: `Schedules already exist for week ${mondayISO} - ${sundayISO}. Use force=true to override.`,
        existingCount: existingSchedules.length,
      });
    }

    // Fetch active employees
    const employees = await query<{
      id: number | string;
      firstName: string;
      surname: string;
      branchId: string | null;
    }>(
      "SELECT id, firstName, surname, branchId FROM users WHERE role = 'employee' AND (archived = 0 OR archived IS NULL) AND status = 'approved'"
    );

    if (employees.length === 0) {
      return NextResponse.json({
        status: "skipped",
        reason: "No active employees found.",
      });
    }

    // Fetch branches
    const branches = await query<{
      id: number | string;
      branchName: string;
    }>("SELECT id, branchName FROM branches ORDER BY branchName");

    if (branches.length === 0) {
      return NextResponse.json({
        status: "skipped",
        reason: "No branches found.",
      });
    }

    // Get current branch names from last week's schedule (if any) for "avoid same branch" logic
    const lastWeekMonday = new Date(monday);
    lastWeekMonday.setDate(monday.getDate() - 7);
    const lastWeekMondayISO = formatDateLocal(lastWeekMonday);

    const lastWeekSchedules = await query<{ assignments: string }>(
      "SELECT assignments FROM schedules WHERE weekStart = ? LIMIT 1",
      [lastWeekMondayISO]
    );

    // Build employee-to-branch mapping from last week
    const lastWeekBranchMap: Record<string, string> = {};
    if (lastWeekSchedules.length > 0 && lastWeekSchedules[0].assignments) {
      try {
        const parsed = typeof lastWeekSchedules[0].assignments === "string"
          ? JSON.parse(lastWeekSchedules[0].assignments)
          : lastWeekSchedules[0].assignments;
        if (Array.isArray(parsed)) {
          for (const a of parsed) {
            if (a.employeeId && a.branchName) {
              lastWeekBranchMap[String(a.employeeId)] = a.branchName;
            }
          }
        }
      } catch {}
    }

    // Prepare employee list with their current branch info
    const employeeList = employees.map((emp) => {
      const currentBranch = branches.find((b) => String(b.id) === String(emp.branchId));
      const lastWeekBranch = lastWeekBranchMap[String(emp.id)];
      return {
        id: String(emp.id),
        firstName: emp.firstName,
        surname: emp.surname,
        currentBranchId: emp.branchId ? String(emp.branchId) : null,
        currentBranchName: lastWeekBranch || currentBranch?.branchName || null,
      };
    });

    const branchList = branches.map((b) => ({
      id: String(b.id),
      branchName: b.branchName,
    }));

    // Generate rotation
    const assignments = generateRotation(employeeList, branchList);

    if (assignments.length === 0) {
      return NextResponse.json({
        status: "error",
        reason: "Rotation algorithm produced no assignments.",
      });
    }

    // Dry-run: return the rotation without saving
    if (dryrun) {
      // Summarize by branch
      const summary: Record<string, string[]> = {};
      for (const a of assignments) {
        if (!summary[a.branchName]) summary[a.branchName] = [];
        summary[a.branchName].push(a.employeeName);
      }

      return NextResponse.json({
        status: "dryrun",
        weekStart: mondayISO,
        weekEnd: sundayISO,
        totalEmployees: employees.length,
        totalBranches: branches.length,
        assignments: assignments.length,
        branchSummary: summary,
        elapsed: `${Date.now() - startTime}ms`,
      });
    }

    // Delete existing schedules for this week (preserve manually scheduled ones)
    await execute(
      "DELETE FROM schedules WHERE weekStart = ? AND (manuallyScheduled = 0 OR manuallyScheduled IS NULL)",
      [mondayISO]
    );

    // Build the grouped branchAssignments structure
    const branchAssignments = groupAssignmentsByBranch(assignments);
    const assignmentsJSON = JSON.stringify(assignments);
    const branchAssignmentsJSON = JSON.stringify(branchAssignments);
    const nowStr = mysqlNow();

    // Save 7 schedule documents (one per day, Mon-Sun)
    let savedCount = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dayISO = formatDateLocal(d);

      // Check if this day already has a manually scheduled entry
      const manual = await query(
        "SELECT id FROM schedules WHERE scheduleFor = ? AND manuallyScheduled = 1 LIMIT 1",
        [dayISO]
      );
      if (manual.length > 0) continue; // Don't overwrite manual schedules

      const id = crypto.randomUUID();
      await execute(
        `INSERT INTO schedules (id, date, time, scheduleFor, branchAssignments, assignments, weekStart, weekEnd, manuallyScheduled, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           time = VALUES(time),
           branchAssignments = VALUES(branchAssignments),
           assignments = VALUES(assignments),
           weekStart = VALUES(weekStart),
           weekEnd = VALUES(weekEnd),
           updatedAt = VALUES(updatedAt)`,
        [
          id,
          mondayISO,
          "07:00",
          dayISO,
          branchAssignmentsJSON,
          assignmentsJSON,
          mondayISO,
          sundayISO,
          0,
          nowStr,
          nowStr,
        ]
      );
      savedCount++;
    }

    // Update employee branchId in users table to match new rotation
    let updatedEmployees = 0;
    for (const a of assignments) {
      try {
        await execute(
          "UPDATE users SET branchId = ?, updatedAt = ? WHERE id = ?",
          [a.branchId, nowStr, a.employeeId]
        );
        updatedEmployees++;
      } catch (err) {
        console.error(`[Cron Rotate] Failed to update branchId for employee ${a.employeeId}:`, err);
      }
    }

    // Build summary
    const summary: Record<string, string[]> = {};
    for (const a of assignments) {
      if (!summary[a.branchName]) summary[a.branchName] = [];
      summary[a.branchName].push(a.employeeName);
    }

    console.log(
      `[Cron Rotate] Rotation complete: ${savedCount} schedule docs saved, ${updatedEmployees} employees updated, week ${mondayISO} - ${sundayISO}`
    );

    return NextResponse.json({
      status: "success",
      weekStart: mondayISO,
      weekEnd: sundayISO,
      schedulesSaved: savedCount,
      employeesUpdated: updatedEmployees,
      totalEmployees: employees.length,
      totalBranches: branches.length,
      branchSummary: summary,
      elapsed: `${Date.now() - startTime}ms`,
    });
  } catch (error: any) {
    console.error("[Cron Rotate] Fatal error:", error);
    return NextResponse.json(
      { status: "error", message: error.message || String(error) },
      { status: 500 }
    );
  }
}
