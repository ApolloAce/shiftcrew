import { NextResponse } from "next/server";
import { query, execute } from "@/lib/mysql";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/schedules?date=YYYY-MM-DD&scheduleFor=YYYY-MM-DD&weekStart=YYYY-MM-DD
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const date = url.searchParams.get("date");
    const scheduleFor = url.searchParams.get("scheduleFor");
    const weekStart = url.searchParams.get("weekStart");

    let sql = "SELECT * FROM schedules";
    const params: any[] = [];
    const conditions: string[] = [];

    if (scheduleFor) {
      // Query by the actual target date (scheduleFor column)
      conditions.push("scheduleFor = ?");
      params.push(scheduleFor);
    } else if (date) {
      // Match either date or scheduleFor to find schedules relevant to this day
      conditions.push("(date = ? OR scheduleFor = ?)");
      params.push(date, date);
    }
    if (weekStart) {
      conditions.push("weekStart = ?");
      params.push(weekStart);
    }

    if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
    sql += " ORDER BY date, time";

    const rows = await query(sql, params);
    return NextResponse.json(rows.map(mapSchedule));
  } catch (error: any) {
    console.error("GET /api/schedules error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// POST /api/schedules — upsert schedule for a date
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // Check if schedule already exists for this date (+ scheduleFor combo)
    let existing: any[] = [];
    if (body.scheduleFor) {
      existing = await query(
        "SELECT id FROM schedules WHERE date = ? AND scheduleFor = ? LIMIT 1",
        [body.date, body.scheduleFor]
      );
    } else {
      existing = await query("SELECT id FROM schedules WHERE date = ? LIMIT 1", [body.date]);
    }

    const branchAssignments = body.branchAssignments
      ? JSON.stringify(body.branchAssignments)
      : body.assignments
        ? JSON.stringify(groupAssignmentsByBranch(body.assignments))
        : null;

    if (existing.length > 0) {
      const id = existing[0].id;
      await execute(
        `UPDATE schedules SET time = ?, branchAssignments = ?, assignments = ?, weekStart = ?, weekEnd = ?, scheduleFor = ?, updatedAt = ? WHERE id = ?`,
        [
          body.time || null,
          branchAssignments,
          body.assignments ? JSON.stringify(body.assignments) : null,
          body.weekStart || null,
          body.weekEnd || null,
          body.scheduleFor || null,
          now,
          id,
        ]
      );

      // Delete duplicates
      if (body.scheduleFor) {
        await execute(
          "DELETE FROM schedules WHERE date = ? AND scheduleFor = ? AND id != ?",
          [body.date, body.scheduleFor, id]
        );
      }

      return NextResponse.json({ id });
    }

    const id = crypto.randomUUID();
    await execute(
      `INSERT INTO schedules (id, date, time, scheduleFor, branchAssignments, assignments, weekStart, weekEnd, manuallyScheduled, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        body.date,
        body.time || null,
        body.scheduleFor || null,
        branchAssignments,
        body.assignments ? JSON.stringify(body.assignments) : null,
        body.weekStart || null,
        body.weekEnd || null,
        body.manuallyScheduled ? 1 : 0,
        now,
        now,
      ]
    );

    // Create shift assignment notifications for each employee in the schedule
    if (body.assignments && Array.isArray(body.assignments)) {
      const scheduleDate = body.scheduleFor || body.date;
      for (const assignment of body.assignments) {
        if (assignment.employeeId) {
          try {
            const notifId = crypto.randomUUID();
            await execute(
              `INSERT INTO notifications (id, recipientId, title, message, type, isRead, createdAt) VALUES (?, ?, ?, ?, ?, 0, ?)`,
              [
                notifId,
                assignment.employeeId,
                "Shift Assigned",
                `You have been assigned to ${assignment.branchName || "a branch"} on ${scheduleDate}.`,
                "info",
                now,
              ]
            );
          } catch (notifErr) {
            // Non-critical — don't fail the schedule save
            console.warn("Failed to create shift notification for", assignment.employeeId, notifErr);
          }
        }
      }
    }

    return NextResponse.json({ id }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/schedules error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// PUT /api/schedules — update assignments
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, assignments, branchAssignments } = body;
    if (!id) return NextResponse.json({ message: "Missing id" }, { status: 400 });

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // If branchAssignments are provided, save both columns
    if (branchAssignments) {
      await execute(
        "UPDATE schedules SET assignments = ?, branchAssignments = ?, updatedAt = ? WHERE id = ?",
        [JSON.stringify(assignments), JSON.stringify(branchAssignments), now, id]
      );
    } else if (assignments) {
      // Rebuild branchAssignments from the flat assignments array
      const grouped = groupAssignmentsByBranch(assignments);
      await execute(
        "UPDATE schedules SET assignments = ?, branchAssignments = ?, updatedAt = ? WHERE id = ?",
        [JSON.stringify(assignments), JSON.stringify(grouped), now, id]
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("PUT /api/schedules error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// DELETE /api/schedules?weekStart=YYYY-MM-DD
export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const weekStart = url.searchParams.get("weekStart");
    if (!weekStart) return NextResponse.json({ message: "Missing weekStart" }, { status: 400 });

    // Delete by weekStart column
    await execute("DELETE FROM schedules WHERE weekStart = ?", [weekStart]);

    // Also delete by each individual day of the week (matching date OR scheduleFor)
    const startDate = new Date(weekStart + "T00:00:00");
    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      const iso = d.toISOString().split("T")[0];
      await execute("DELETE FROM schedules WHERE date = ? OR scheduleFor = ?", [iso, iso]);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE /api/schedules error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

function mapSchedule(row: any) {
  return {
    id: row.id,
    date: row.date,
    time: row.time,
    scheduleFor: row.scheduleFor,
    branchAssignments: typeof row.branchAssignments === "string" ? JSON.parse(row.branchAssignments) : row.branchAssignments,
    assignments: typeof row.assignments === "string" ? JSON.parse(row.assignments) : row.assignments,
    weekStart: row.weekStart,
    weekEnd: row.weekEnd,
    manuallyScheduled: !!row.manuallyScheduled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function groupAssignmentsByBranch(assignments: any[]) {
  const map = new Map<string, any>();
  for (const a of assignments) {
    if (!map.has(a.branchId)) {
      map.set(a.branchId, { branchId: a.branchId, branchName: a.branchName || a.branchId, employees: [] });
    }
    map.get(a.branchId)!.employees.push({
      employeeId: a.employeeId,
      employeeName: a.employeeName,
      isPresent: a.isPresent,
      shift: a.shift,
    });
  }
  return Array.from(map.values());
}
