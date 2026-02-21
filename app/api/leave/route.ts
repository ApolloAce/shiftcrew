import { NextResponse } from "next/server";
import { query, execute } from "@/lib/mysql";

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
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

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

    // Notify the employee that their leave request was submitted
    try {
      const notifId = crypto.randomUUID();
      await execute(
        `INSERT INTO notifications (id, recipientId, title, message, type, isRead, createdAt) VALUES (?, ?, ?, ?, ?, 0, ?)`,
        [notifId, body.employeeId, "Leave Request Submitted", `Your leave request (${body.startDate} - ${body.endDate}) has been submitted and is pending approval.`, "info", now]
      );
      // Broadcast notification for admins (recipientId = NULL)
      const adminNotifId = crypto.randomUUID();
      await execute(
        `INSERT INTO notifications (id, recipientId, title, message, type, isRead, createdAt) VALUES (?, ?, ?, ?, ?, 0, ?)`,
        [adminNotifId, null, "New Leave Request", `${body.employeeName || "An employee"} submitted a leave request for ${body.startDate} - ${body.endDate}.`, "info", now]
      );
    } catch (notifErr) {
      console.warn("Failed to create leave submission notification:", notifErr);
    }

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
    params.push(new Date().toISOString().slice(0, 19).replace('T', ' '));
    params.push(id);

    await execute(`UPDATE leave_requests SET ${setClauses.join(", ")} WHERE id = ?`, params);

    // Create notification for the employee when leave status changes
    if (updates.status === "approved" || updates.status === "rejected") {
      try {
        // Fetch the leave request to get the employeeId
        const leaveRows = await query("SELECT employeeId, employeeName, startDate, endDate FROM leave_requests WHERE id = ?", [id]);
        if (leaveRows.length > 0) {
          const leave = leaveRows[0] as any;
          const notifId = crypto.randomUUID();
          const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
          const statusLabel = updates.status === "approved" ? "Approved" : "Rejected";
          const notifType = updates.status === "approved" ? "success" : "error";
          await execute(
            `INSERT INTO notifications (id, recipientId, title, message, type, isRead, createdAt) VALUES (?, ?, ?, ?, ?, 0, ?)`,
            [
              notifId,
              leave.employeeId,
              `Leave Request ${statusLabel}`,
              `Your leave request (${leave.startDate} - ${leave.endDate}) has been ${updates.status}.${updates.notes ? ` Note: ${updates.notes}` : ""}`,
              notifType,
              now,
            ]
          );
        }
      } catch (notifErr) {
        console.warn("Failed to create leave notification:", notifErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("PUT /api/leave error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
