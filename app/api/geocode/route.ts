import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/geocode?lat=xxx&lon=xxx  — reverse geocode
// GET /api/geocode?q=xxx            — forward search
// Proxies Nominatim to avoid CORS issues from the browser
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const lat = url.searchParams.get("lat");
    const lon = url.searchParams.get("lon");
    const q = url.searchParams.get("q");

    let nominatimUrl: string;

    if (lat && lon) {
      // Reverse geocode
      nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=18&addressdetails=1`;
    } else if (q) {
      // Forward search
      nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&addressdetails=1`;
    } else {
      return NextResponse.json({ message: "Missing lat/lon or q parameter" }, { status: 400 });
    }

    const res = await fetch(nominatimUrl, {
      headers: {
        "User-Agent": "ShiftCrew/1.0 (https://linuscodex.site)",
        "Accept-Language": "en",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Nominatim error:", res.status, text);
      return NextResponse.json({ message: "Geocode service error", status: res.status }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("GET /api/geocode error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
