import { NextResponse } from "next/server";
import { query } from "@/lib/mysql";
import { isWithinRadius } from "@/lib/geo-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/attendance/validate-location
 * Body: { employeeId, latitude, longitude, accuracy? }
 *
 * Validates whether the employee's current GPS position is within
 * the attendance radius of their assigned branch.
 *
 * Returns:
 *   { valid: true, branchName, branchId, distanceMeters }
 *   or
 *   { valid: false, message, distanceMeters, branchName, requiredRadius }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { employeeId, latitude, longitude, accuracy } = body;

    if (!employeeId || latitude == null || longitude == null) {
      return NextResponse.json(
        { valid: false, message: "Missing employeeId, latitude, or longitude" },
        { status: 400 }
      );
    }

    // Reject obviously inaccurate readings (accuracy > 500m suggests GPS spoofing or poor signal)
    if (accuracy && accuracy > 500) {
      return NextResponse.json(
        { valid: false, message: "GPS accuracy is too low. Please move to an open area or enable high-accuracy location." },
        { status: 200 }
      );
    }

    // 1. Get the employee's assigned branchId
    const employees: any[] = await query(
      "SELECT id, branchId, firstName, surname FROM users WHERE id = ? LIMIT 1",
      [employeeId]
    );

    if (!employees || employees.length === 0) {
      return NextResponse.json(
        { valid: false, message: "Employee not found" },
        { status: 404 }
      );
    }

    const employee = employees[0];

    if (!employee.branchId) {
      return NextResponse.json(
        { valid: false, message: "You are not assigned to any branch. Please contact your administrator." },
        { status: 200 }
      );
    }

    // 2. Get the branch location and radius
    const branches: any[] = await query(
      "SELECT id, branchName, latitude, longitude, radius, address FROM branches WHERE id = ? LIMIT 1",
      [employee.branchId]
    );

    if (!branches || branches.length === 0) {
      return NextResponse.json(
        { valid: false, message: "Assigned branch not found in the system." },
        { status: 200 }
      );
    }

    const branch = branches[0];

    if (branch.latitude == null || branch.longitude == null) {
      return NextResponse.json(
        { valid: false, message: "Branch location has not been configured. Please contact your administrator." },
        { status: 200 }
      );
    }

    const branchLat = parseFloat(branch.latitude);
    const branchLng = parseFloat(branch.longitude);
    const radiusMeters = branch.radius || 100;

    // 3. Calculate distance using Haversine formula
    const result = isWithinRadius(
      parseFloat(latitude),
      parseFloat(longitude),
      branchLat,
      branchLng,
      radiusMeters
    );

    if (result.withinRadius) {
      return NextResponse.json({
        valid: true,
        branchId: branch.id,
        branchName: branch.branchName,
        distanceMeters: result.distanceMeters,
        radiusMeters,
      });
    } else {
      return NextResponse.json({
        valid: false,
        message: `You are not in the branch. You are ${result.distanceMeters}m away from ${branch.branchName}. Please go to your designated branch before clocking in. (Required: within ${radiusMeters}m)`,
        branchId: branch.id,
        branchName: branch.branchName,
        distanceMeters: result.distanceMeters,
        requiredRadius: radiusMeters,
      });
    }
  } catch (error: any) {
    console.error("POST /api/attendance/validate-location error:", error);
    return NextResponse.json({ valid: false, message: "Server error" }, { status: 500 });
  }
}
