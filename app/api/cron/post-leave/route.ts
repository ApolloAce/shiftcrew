import { NextResponse } from "next/server";
import { query, execute, mysqlNow } from "@/lib/mysql";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CRON_SECRET = process.env.CRON_SECRET || "shiftcrew-cron-2026";

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
    default:   return { shiftStart: "07:00", shiftEnd: "14:00" };
  }
}

/**
 * GET /api/cron/post-leave?secret=xxx[&dryrun=true]
 *
 * Daily cron that finds employees whose approved leave just ended (yesterday)
 * and injects them into the remaining schedule days for the current week.
 *
 * Picks the least-loaded branch for fair distribution.
 * Sends a notification so the employee knows they're back on schedule.
 */
export async function GET(req: Request) {
  const startTime = Date.now();
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  const dryrun = url.searchParams.get("dryrun") === "true";

  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const todayISO = formatDateLocal(now);
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayISO = formatDateLocal(yesterday);

    const { monday, mondayISO, sundayISO } = getWeekBounds(now);

    // ── Step 1: Find employees whose leaves ended yesterday or today ──
    // (endDate = yesterday means they're available from today)
    // (endDate = today means they're available from tomorrow, but we include today's
    //  remaining hours — the employee page will check the exact date)
    const expiredLeaves = await query<{
      employeeId: string;
      employeeName: string;
      endDate: string;
    }>(
      `SELECT lr.employeeId, CONCAT(u.firstName, ' ', u.surname) AS employeeName, lr.endDate
       FROM leave_requests lr
       JOIN users u ON u.id = lr.employeeId
       WHERE lr.status = 'approved'
         AND lr.endDate IN (?, ?)
         AND u.role = 'employee'
         AND (u.archived = 0 OR u.archived IS NULL)
         AND u.status = 'approved'`,
      [yesterdayISO, todayISO]
    );

    if (expiredLeaves.length === 0) {
      return NextResponse.json({
        status: "skipped",
        reason: "No employees returning from leave today.",
        todayISO,
        elapsed: `${Date.now() - startTime}ms`,
      });
    }

    // Deduplicate by employeeId (an employee might have multiple leave records)
    const returningMap = new Map<string, { employeeId: string; employeeName: string; endDate: string }>();
    for (const lv of expiredLeaves) {
      const existing = returningMap.get(lv.employeeId);
      // Keep the latest endDate
      if (!existing || lv.endDate > existing.endDate) {
        returningMap.set(lv.employeeId, lv);
      }
    }

    // ── Step 2: Check they don't have another overlapping leave still active ──
    const candidates: typeof expiredLeaves = [];
    for (const [empId, lv] of returningMap) {
      // The day after their leave ends, they should be on schedule
      const returnDate = lv.endDate === todayISO
        ? formatDateLocal(new Date(now.getTime() + 86400000)) // tomorrow
        : todayISO; // leave ended yesterday → available today

      // Check for any OTHER active leave that still covers from returnDate onward
      const overlapping = await query<{ id: string }>(
        `SELECT id FROM leave_requests
         WHERE employeeId = ? AND status = 'approved'
           AND startDate <= ? AND endDate >= ?
           AND endDate > ?
         LIMIT 1`,
        [empId, sundayISO, returnDate, lv.endDate]
      );

      if (overlapping.length === 0) {
        candidates.push({ ...lv, endDate: lv.endDate });
      }
    }

    if (candidates.length === 0) {
      return NextResponse.json({
        status: "skipped",
        reason: "All returning employees have overlapping leave — no reassignment needed.",
        checked: expiredLeaves.length,
        elapsed: `${Date.now() - startTime}ms`,
      });
    }

    // ── Step 3: Get branches and current schedule data ──
    const branches = await query<{ id: string; branchName: string; maxCapacity: number | null }>(
      "SELECT id, branchName, maxCapacity FROM branches ORDER BY branchName"
    );

    if (branches.length === 0) {
      return NextResponse.json({ status: "error", reason: "No branches found." });
    }

    // Collect remaining dates in the week (from today or tomorrow onwards)
    const remainingDates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dISO = formatDateLocal(d);
      if (dISO >= todayISO) remainingDates.push(dISO);
    }

    // For each remaining date, load the current schedule
    const schedulesByDate: Record<string, any> = {};
    for (const dateISO of remainingDates) {
      const rows = await query<any>(
        "SELECT * FROM schedules WHERE scheduleFor = ? ORDER BY updatedAt DESC LIMIT 1",
        [dateISO]
      );
      if (rows.length > 0) {
        const sched = rows[0];
        let ba = sched.branchAssignments;
        if (typeof ba === "string") {
          try { ba = JSON.parse(ba); } catch { ba = []; }
        }
        let assignments = sched.assignments;
        if (typeof assignments === "string") {
          try { assignments = JSON.parse(assignments); } catch { assignments = []; }
        }
        schedulesByDate[dateISO] = { ...sched, branchAssignments: ba || [], assignments: assignments || [] };
      }
    }

    // ── Step 4: For each candidate, find which dates they're missing and assign ──
    const results: Array<{
      employeeId: string;
      employeeName: string;
      assignedBranch: string;
      assignedBranchId: string;
      datesAdded: string[];
    }> = [];
    const nowStr = mysqlNow();

    for (const candidate of candidates) {
      const empId = candidate.employeeId;
      const empName = candidate.employeeName;

      // Determine the first available date for this employee
      const firstAvailableDate = candidate.endDate === todayISO
        ? formatDateLocal(new Date(now.getTime() + 86400000)) // available from tomorrow
        : todayISO; // leave ended yesterday → available today

      // Find dates where this employee is NOT in the schedule
      const missingDates: string[] = [];
      for (const dateISO of remainingDates) {
        if (dateISO < firstAvailableDate) continue;
        const sched = schedulesByDate[dateISO];
        if (!sched) {
          missingDates.push(dateISO);
          continue;
        }
        // Check if employee is already in the assignment list
        const found = (sched.assignments || []).some(
          (a: any) => String(a.employeeId) === String(empId)
        );
        if (!found) missingDates.push(dateISO);
      }

      if (missingDates.length === 0) continue; // already scheduled

      // Pick the least-loaded branch across the remaining schedule
      // Count employees per branch from today's schedule
      const branchLoad: Record<string, number> = {};
      for (const b of branches) branchLoad[b.id] = 0;

      const todaySchedule = schedulesByDate[todayISO] || schedulesByDate[remainingDates[0]];
      if (todaySchedule?.branchAssignments) {
        for (const ba of todaySchedule.branchAssignments) {
          const bid = String(ba.branchId);
          if (branchLoad[bid] !== undefined) {
            branchLoad[bid] = (ba.employees?.length || 0);
          }
        }
      }

      // Pick branch with minimum load (respect maxCapacity)
      let bestBranch = branches[0];
      let bestLoad = Infinity;
      for (const b of branches) {
        const load = branchLoad[b.id] || 0;
        const atCapacity = b.maxCapacity ? load >= b.maxCapacity : false;
        if (!atCapacity && load < bestLoad) {
          bestLoad = load;
          bestBranch = b;
        }
      }

      // Build the employee assignment entry
      const shift = "AM";
      const newEntry = {
        employeeId: empId,
        employeeName: empName,
        branchId: String(bestBranch.id),
        branchName: bestBranch.branchName,
        shift,
        isManual: false,
        isPresent: false,
        ...getShiftTimes(shift),
      };

      if (dryrun) {
        results.push({
          employeeId: empId,
          employeeName: empName,
          assignedBranch: bestBranch.branchName,
          assignedBranchId: String(bestBranch.id),
          datesAdded: missingDates,
        });
        continue;
      }

      // ── Inject into each missing date's schedule ──
      const datesAdded: string[] = [];
      for (const dateISO of missingDates) {
        const existing = schedulesByDate[dateISO];

        if (existing) {
          // Add to existing schedule
          const updatedAssignments = [...(existing.assignments || []), newEntry];
          const updatedBA = regroupByBranch(updatedAssignments);

          await execute(
            `UPDATE schedules SET assignments = ?, branchAssignments = ?, updatedAt = ? WHERE id = ?`,
            [JSON.stringify(updatedAssignments), JSON.stringify(updatedBA), nowStr, existing.id]
          );

          // Update in-memory for subsequent candidates
          existing.assignments = updatedAssignments;
          existing.branchAssignments = updatedBA;
        } else {
          // Create a new schedule doc for this date
          const scheduleId = crypto.randomUUID();
          const assignmentsList = [newEntry];
          const ba = regroupByBranch(assignmentsList);

          await execute(
            `INSERT INTO schedules (id, date, time, scheduleFor, branchAssignments, assignments, weekStart, weekEnd, manuallyScheduled, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [scheduleId, mondayISO, "07:00", dateISO,
             JSON.stringify(ba), JSON.stringify(assignmentsList),
             mondayISO, sundayISO, 0, nowStr, nowStr]
          );

          schedulesByDate[dateISO] = { id: scheduleId, assignments: assignmentsList, branchAssignments: ba };
        }
        datesAdded.push(dateISO);
      }

      // ── Update users.branchId ──
      await execute(
        "UPDATE users SET branchId = ?, updatedAt = ? WHERE id = ?",
        [String(bestBranch.id), nowStr, empId]
      );

      // ── Send notification ──
      try {
        await execute(
          `INSERT INTO notifications (id, recipientId, title, message, type, isRead, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            crypto.randomUUID(),
            empId,
            "Welcome Back — Schedule Updated",
            `Your leave has ended. You have been assigned to ${bestBranch.branchName} (AM shift) for the rest of this week.`,
            "schedule",
            0,
            nowStr,
          ]
        );
      } catch (err) {
        console.error(`[Post-Leave] Notification failed for ${empId}:`, err);
      }

      results.push({
        employeeId: empId,
        employeeName: empName,
        assignedBranch: bestBranch.branchName,
        assignedBranchId: String(bestBranch.id),
        datesAdded,
      });
    }

    const elapsed = `${Date.now() - startTime}ms`;
    console.log(`[Post-Leave] ${dryrun ? "DRY RUN — " : ""}${results.length} employees reassigned after leave.`);

    return NextResponse.json({
      status: dryrun ? "dryrun" : "success",
      todayISO,
      weekStart: mondayISO,
      weekEnd: sundayISO,
      leavesExpired: candidates.length,
      reassigned: results.length,
      details: results,
      elapsed,
    });
  } catch (error: any) {
    console.error("[Post-Leave] Fatal error:", error);
    return NextResponse.json({ status: "error", message: error.message || String(error) }, { status: 500 });
  }
}

// ─── Regroup flat assignments into branchAssignments structure ────────────────

function regroupByBranch(assignments: any[]): any[] {
  const map = new Map<string, any>();
  for (const a of assignments) {
    if (!map.has(a.branchId)) {
      map.set(a.branchId, { branchId: a.branchId, branchName: a.branchName || a.branchId, employees: [] });
    }
    map.get(a.branchId)!.employees.push({
      employeeId: a.employeeId,
      employeeName: a.employeeName,
      isPresent: a.isPresent || false,
      isManual: a.isManual || false,
      shift: a.shift,
      shiftStart: a.shiftStart,
      shiftEnd: a.shiftEnd,
    });
  }
  return Array.from(map.values());
}
