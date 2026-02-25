import { NextResponse } from "next/server";
import { query, execute, mysqlNow } from "@/lib/mysql";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/notifications?recipientId=xxx&unreadOnly=true
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const recipientId = url.searchParams.get("recipientId");
    const unreadOnly = url.searchParams.get("unreadOnly");

    let sql = "SELECT * FROM notifications";
    const conditions: string[] = [];
    const params: any[] = [];

    if (recipientId) {
      // Return notifications for this recipient OR broadcast notifications (recipientId IS NULL)
      conditions.push("(recipientId = ? OR recipientId IS NULL)");
      params.push(recipientId);
    }
    if (unreadOnly === "true") {
      conditions.push("isRead = 0");
    }

    if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
    sql += " ORDER BY createdAt DESC";

    const rows = await query(sql, params);
    return NextResponse.json(rows);
  } catch (error: any) {
    console.error("GET /api/notifications error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// POST /api/notifications — create a notification
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const id = crypto.randomUUID();
    const now = mysqlNow();

    await execute(
      `INSERT INTO notifications (id, recipientId, title, message, type, isRead, createdAt)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
      [
        id,
        body.recipientId || null,
        body.title,
        body.message,
        body.type || "info",
        now,
      ]
    );

    return NextResponse.json({ id }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/notifications error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// PUT /api/notifications — mark as read (body: { id } or { recipientId, markAllRead: true })
export async function PUT(req: Request) {
  try {
    const body = await req.json();

    if (body.markAllRead && body.recipientId) {
      // Mark all notifications as read for a recipient
      await execute(
        "UPDATE notifications SET isRead = 1 WHERE (recipientId = ? OR recipientId IS NULL) AND isRead = 0",
        [body.recipientId]
      );
      return NextResponse.json({ success: true });
    }

    const { id } = body;
    if (!id) return NextResponse.json({ message: "Missing id" }, { status: 400 });

    await execute("UPDATE notifications SET isRead = 1 WHERE id = ?", [id]);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("PUT /api/notifications error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
