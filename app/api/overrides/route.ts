import { NextResponse } from "next/server";
import { query, execute, mysqlNow } from "@/lib/mysql";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/overrides?date=YYYY-MM-DD&employeeId=xxx&weekStart=YYYY-MM-DD
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const date = url.searchParams.get("date");
    const employeeId = url.searchParams.get("employeeId");
    const weekStart = url.searchParams.get("weekStart");

    let sql = "SELECT * FROM manual_overrides";
    const conditions: string[] = [];
    const params: any[] = [];

    if (date && employeeId) {
      conditions.push("date = ?");
      params.push(date);
      conditions.push("employeeId = ?");
      params.push(employeeId);
    } else if (date) {
      conditions.push("date = ?");
      params.push(date);
    } else if (employeeId) {
      conditions.push("employeeId = ?");
      params.push(employeeId);
    } else if (weekStart) {
      const start = getWeekStart(weekStart);
      const startObj = new Date(start + "T00:00:00");
      const endObj = new Date(startObj);
      endObj.setUTCDate(endObj.getUTCDate() + 6);
      const endStr = endObj.toISOString().split("T")[0];
      conditions.push("date >= ? AND date <= ?");
      params.push(start, endStr);
    }

    if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
    sql += " ORDER BY date";

    const rows = await query(sql, params);
    return NextResponse.json(rows);
  } catch (error: any) {
    console.error("GET /api/overrides error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// POST /api/overrides — save override
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const id = crypto.randomUUID();
    const now = mysqlNow();

    const dayOfWeek = body.dayOfWeek || getDayOfWeekName(body.date);

    await execute(
      `INSERT INTO manual_overrides (id, employeeId, employeeName, date, dayOfWeek, overrideBranchId, overrideBranchName, originalBranchId, originalBranchName, shift, reason, createdBy, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        body.employeeId,
        body.employeeName || "",
        body.date,
        dayOfWeek,
        body.overrideBranchId,
        body.overrideBranchName || "",
        body.originalBranchId || null,
        body.originalBranchName || null,
        body.shift || null,
        body.reason || null,
        body.createdBy || null,
        now,
        now,
      ]
    );

    return NextResponse.json({ id }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/overrides error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// PUT /api/overrides — update override
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ message: "Missing id" }, { status: 400 });

    const setClauses: string[] = [];
    const params: any[] = [];

    for (const [key, value] of Object.entries(updates)) {
      setClauses.push(`\`${key}\` = ?`);
      params.push(value);
    }

    setClauses.push("updatedAt = ?");
    params.push(mysqlNow());
    params.push(id);

    await execute(`UPDATE manual_overrides SET ${setClauses.join(", ")} WHERE id = ?`, params);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("PUT /api/overrides error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// DELETE /api/overrides?id=xxx or ?employeeId=xxx&date=YYYY-MM-DD
export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const employeeId = url.searchParams.get("employeeId");
    const date = url.searchParams.get("date");

    if (id) {
      await execute("DELETE FROM manual_overrides WHERE id = ?", [id]);
    } else if (employeeId && date) {
      await execute("DELETE FROM manual_overrides WHERE employeeId = ? AND date = ?", [employeeId, date]);
    } else {
      return NextResponse.json({ message: "Missing id or employeeId+date" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE /api/overrides error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

function getDayOfWeekName(date: string): string {
  const d = new Date(date + "T00:00:00");
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[d.getUTCDay()];
}

function getWeekStart(date: string): string {
  const d = new Date(date + "T00:00:00");
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setUTCDate(diff));
  return monday.toISOString().split("T")[0];
}
