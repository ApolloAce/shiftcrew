import { NextResponse } from "next/server";
import { query, execute, mysqlNow } from "@/lib/mysql";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/leave?employeeId=xxx&status=pending
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const employeeId = url.searchParams.get("employeeId");
    const status = url.searchParams.get("status");

    let sql = "SELECT * FROM leave_requests";
    const conditions: string[] = [];
    const params: any[] = [];

    if (employeeId) {
      conditions.push("employeeId = ?");
      params.push(employeeId);
    }
    if (status) {
      conditions.push("status = ?");
      params.push(status);
    }
    if (conditions.length) sql += " WHERE " + conditions.join(" AND ");

    sql += " ORDER BY createdAt DESC";
    const rows = await query(sql, params);
    return NextResponse.json(rows);
  } catch (error: any) {
    console.error("GET /api/leave error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// POST /api/leave — add leave request
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const id = crypto.randomUUID();
    const now = mysqlNow();

    await execute(
      `INSERT INTO leave_requests (id, employeeId, employeeName, startDate, endDate, reason, status, type, notes, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        body.employeeId,
        body.employeeName || null,
        body.startDate,
        body.endDate,
        body.reason || null,
        body.status || "pending",
        body.type || null,
        body.notes || null,
        now,
      ]
    );

    return NextResponse.json({ id }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/leave error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// PUT /api/leave — update leave request (approve / reject / edit)
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ message: "Missing id" }, { status: 400 });

    const setClauses: string[] = [];
    const params: any[] = [];

    for (const [key, value] of Object.entries(updates)) {
      setClauses.push(`\`${key}\` = ?`);
      params.push(value ?? null);
    }

    setClauses.push("reviewedAt = ?");
    params.push(mysqlNow());
    params.push(id);

    await execute(`UPDATE leave_requests SET ${setClauses.join(", ")} WHERE id = ?`, params);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("PUT /api/leave error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
