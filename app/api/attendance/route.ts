import { NextResponse } from "next/server";
import { query, execute, mysqlNow } from "@/lib/mysql";

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

// POST /api/attendance — save or update attendance record
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const docId = `${body.employeeId}_${body.date}`;
    const now = mysqlNow();

    // Check if this is a clock-in and a record already exists (duplicate prevention)
    if (body.action === "clock-in") {
      const existing = await query(
        "SELECT id, timeIn FROM daily_attendance WHERE id = ? LIMIT 1",
        [docId]
      );
      if (existing.length > 0 && existing[0].timeIn) {
        return NextResponse.json({
          id: docId,
          alreadyClockedIn: true,
          timeIn: existing[0].timeIn,
        }, { status: 200 });
      }
    }

    // For clock-out, update timeOut and compute undertime based on 9hr rule (8hr work + 1hr break)
    if (body.action === "clock-out") {
      // Fetch the existing record to get timeIn
      const existing = await query(
        "SELECT timeIn, status FROM daily_attendance WHERE id = ? LIMIT 1",
        [docId]
      );
      const timeIn = existing[0]?.timeIn;
      const timeOut = body.timeOut;
      let status = existing[0]?.status || "present";

      // Compute total work hours: if less than 9 hours (8hr work + 1hr break), mark undertime
      if (timeIn && timeOut) {
        const [inH, inM] = timeIn.split(":").map(Number);
        const [outH, outM] = timeOut.split(":").map(Number);
        const totalMinutes = (outH * 60 + outM) - (inH * 60 + inM);
        if (totalMinutes < 540) { // 9 hours = 540 minutes
          status = "undertime";
        } else {
          status = "present";
        }
      }

      await execute(
        `UPDATE daily_attendance SET timeOut = ?, status = ?, updatedAt = ? WHERE id = ?`,
        [timeOut || null, status, now, docId]
      );
      return NextResponse.json({ id: docId, timeOut, status }, { status: 200 });
    }

    // Clock-in or general attendance save
    await execute(
      `INSERT INTO daily_attendance (id, employeeId, employeeName, date, status, timeIn, timeOut, photoUrl, latitude, longitude, branchId, branchName, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         employeeName = VALUES(employeeName),
         status = VALUES(status),
         timeIn = COALESCE(daily_attendance.timeIn, VALUES(timeIn)),
         timeOut = COALESCE(VALUES(timeOut), daily_attendance.timeOut),
         photoUrl = COALESCE(VALUES(photoUrl), daily_attendance.photoUrl),
         latitude = COALESCE(VALUES(latitude), daily_attendance.latitude),
         longitude = COALESCE(VALUES(longitude), daily_attendance.longitude),
         branchId = COALESCE(VALUES(branchId), daily_attendance.branchId),
         branchName = COALESCE(VALUES(branchName), daily_attendance.branchName),
         updatedAt = VALUES(updatedAt)`,
      [
        docId,
        body.employeeId,
        body.employeeName || null,
        body.date,
        body.status || "present",
        body.timeIn || null,
        body.timeOut || null,
        body.photoUrl || null,
        body.latitude || null,
        body.longitude || null,
        body.branchId || null,
        body.branchName || null,
        now,
        now,
      ]
    );

    return NextResponse.json({ id: docId, timeIn: body.timeIn }, { status: 201 });
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
