import { NextResponse } from "next/server";
import { db } from "../../../lib/firebaseAdmin";

export async function GET() {
  try {
    const snapshot = await db.collection("users").limit(1).get();
    return NextResponse.json({ success: true, count: snapshot.size });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
