import { NextResponse } from "next/server";
import { query } from "../../../lib/mysql";

export async function GET() {
  try {
    const rows = await query("SELECT COUNT(*) as cnt FROM users");
    return NextResponse.json({ success: true, count: rows[0]?.cnt ?? 0 });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
