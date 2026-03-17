import { NextResponse } from "next/server";
import { query, execute, mysqlNow } from "@/lib/mysql";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/schedules?date=YYYY-MM-DD
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const date = url.searchParams.get("date");
    const weekStart = url.searchParams.get("weekStart");
    const scheduleFor = url.searchParams.get("scheduleFor");
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    let sql = "SELECT * FROM schedules";
    const params: any[] = [];
    const conditions: string[] = [];

    if (scheduleFor) {
      conditions.push("scheduleFor = ?");
      params.push(scheduleFor);
    }
    if (date) {
      conditions.push("date = ?");
      params.push(date);
    }
    if (weekStart) {
      conditions.push("weekStart = ?");
      params.push(weekStart);
    }
    if (startDate && endDate) {
      conditions.push("COALESCE(scheduleFor, date) BETWEEN ? AND ?");
      params.push(startDate, endDate);
    } else if (startDate) {
      conditions.push("COALESCE(scheduleFor, date) >= ?");
      params.push(startDate);
    } else if (endDate) {
      conditions.push("COALESCE(scheduleFor, date) <= ?");
      params.push(endDate);
    }

    if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
    sql += " ORDER BY COALESCE(scheduleFor, date), time";

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
    const now = mysqlNow();

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

    const now = mysqlNow();

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

// DELETE /api/schedules?weekStart=YYYY-MM-DD&preserveManual=true
export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const weekStart = url.searchParams.get("weekStart");
    const preserveManual = url.searchParams.get("preserveManual") === "true";
    if (!weekStart) return NextResponse.json({ message: "Missing weekStart" }, { status: 400 });

    const manualCondition = preserveManual ? " AND (manuallyScheduled = 0 OR manuallyScheduled IS NULL)" : "";

    // Delete by weekStart (skip manually scheduled if requested)
    await execute(`DELETE FROM schedules WHERE weekStart = ?${manualCondition}`, [weekStart]);

    // Also delete by each individual day of the week
    const startDate = new Date(weekStart + "T00:00:00");
    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      const iso = d.toISOString().split("T")[0];
      await execute(`DELETE FROM schedules WHERE date = ?${manualCondition}`, [iso]);
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
      isManual: a.isManual || false,
      shift: a.shift,
      shiftStart: a.shiftStart,
      shiftEnd: a.shiftEnd,
    });
  }
  return Array.from(map.values());
}
