import { NextResponse } from "next/server";
import { query, execute } from "@/lib/mysql";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/attendance?date=YYYY-MM-DD&employeeId=xxx&startDate=...&endDate=...
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const date = url.searchParams.get("date");
    const employeeId = url.searchParams.get("employeeId");
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const stats = url.searchParams.get("stats");

    let sql = "SELECT * FROM daily_attendance";
    const conditions: string[] = [];
    const params: any[] = [];

    if (date) { conditions.push("date = ?"); params.push(date); }
    if (employeeId) { conditions.push("employeeId = ?"); params.push(employeeId); }
    if (startDate) { conditions.push("date >= ?"); params.push(startDate); }
    if (endDate) { conditions.push("date <= ?"); params.push(endDate); }

    if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
    sql += " ORDER BY date DESC";

    const rows = await query(sql, params);

    if (stats === "true" && date) {
      const presentCount = rows.filter((r: any) => r.status === "present").length;
      const absentCount = rows.filter((r: any) => r.status === "absent").length;
      const totalRecords = rows.length;
      const attendancePercentage = totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : 0;
      return NextResponse.json({ totalRecords, presentCount, absentCount, attendancePercentage });
    }

    return NextResponse.json(rows);
  } catch (error: any) {
    console.error("GET /api/attendance error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// POST /api/attendance — clock-in or clock-out
// Body: { employeeId, employeeName, date, status, action?: "clock-in"|"clock-out",
//         branchId?, branchName?, photoUrl?, latitude?, longitude?, timeIn?, timeOut? }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const docId = `${body.employeeId}_${body.date}`;
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    const action = body.action || "clock-in";

    if (action === "clock-out") {
      // Clock-out: update existing record with timeOut
      const timeOut = body.timeOut || new Date().toTimeString().slice(0, 8);
      const existing: any[] = await query("SELECT id, timeIn FROM daily_attendance WHERE id = ?", [docId]);
      if (!existing || existing.length === 0) {
        return NextResponse.json({ message: "No clock-in record found for today. Please clock in first." }, { status: 400 });
      }
      await execute(
        `UPDATE daily_attendance SET timeOut = ?, updatedAt = ? WHERE id = ?`,
        [timeOut, now, docId]
      );
      return NextResponse.json({ id: docId, timeOut }, { status: 200 });
    }

    // Clock-in: check if already clocked in today
    const existing: any[] = await query("SELECT id, timeIn FROM daily_attendance WHERE id = ?", [docId]);
    if (existing && existing.length > 0 && existing[0].timeIn) {
      // Already clocked in — return the existing record instead of blocking
      return NextResponse.json({
        id: docId,
        alreadyClockedIn: true,
        timeIn: existing[0].timeIn,
        message: "You have already clocked in today."
      }, { status: 200 });
    }

    const timeIn = body.timeIn || new Date().toTimeString().slice(0, 8);

    await execute(
      `INSERT INTO daily_attendance (id, employeeId, employeeName, date, status, timeIn, photoUrl, latitude, longitude, branchId, branchName, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         employeeName = VALUES(employeeName),
         status = VALUES(status),
         timeIn = VALUES(timeIn),
         photoUrl = VALUES(photoUrl),
         latitude = VALUES(latitude),
         longitude = VALUES(longitude),
         branchId = VALUES(branchId),
         branchName = VALUES(branchName),
         updatedAt = VALUES(updatedAt)`,
      [
        docId,
        body.employeeId,
        body.employeeName || null,
        body.date,
        body.status || "present",
        timeIn,
        body.photoUrl || null,
        body.latitude || null,
        body.longitude || null,
        body.branchId || null,
        body.branchName || null,
        now,
        now,
      ]
    );

    return NextResponse.json({ id: docId, timeIn }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/attendance error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// DELETE /api/attendance?employeeId=xxx&date=YYYY-MM-DD
export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const employeeId = url.searchParams.get("employeeId");
    const date = url.searchParams.get("date");
    if (!employeeId || !date) return NextResponse.json({ message: "Missing employeeId or date" }, { status: 400 });

    const docId = `${employeeId}_${date}`;
    await execute("DELETE FROM daily_attendance WHERE id = ?", [docId]);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE /api/attendance error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
