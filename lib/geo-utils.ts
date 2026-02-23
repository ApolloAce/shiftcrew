/**
 * Geolocation utilities for branch radius validation.
 * Uses the Haversine formula to calculate distance between two GPS coordinates.
 */

const EARTH_RADIUS_METERS = 6_371_000 // Earth's mean radius in meters

/**
 * Calculate the distance in meters between two lat/lng points using the Haversine formula.
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180

  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return EARTH_RADIUS_METERS * c
}

/**
 * Check if a point is within a given radius (meters) of a center point.
 * Returns { withinRadius, distanceMeters }.
 */
export function isWithinRadius(
  userLat: number,
  userLng: number,
  branchLat: number,
  branchLng: number,
  radiusMeters: number
): { withinRadius: boolean; distanceMeters: number } {
  const distanceMeters = haversineDistance(userLat, userLng, branchLat, branchLng)
  return {
    withinRadius: distanceMeters <= radiusMeters,
    distanceMeters: Math.round(distanceMeters),
  }
}

/** Predefined radius options in meters for the admin UI */
export const RADIUS_OPTIONS = [
  { value: 50, label: "50 meters" },
  { value: 100, label: "100 meters" },
  { value: 150, label: "150 meters" },
  { value: 200, label: "200 meters" },
  { value: 300, label: "300 meters" },
  { value: 500, label: "500 meters" },
  { value: 1000, label: "1 kilometer" },
]

/** Default center for the Philippines */
export const PH_CENTER = { lat: 12.8797, lng: 121.774 }
export const PH_BOUNDS = {
  south: 4.5,
  north: 21.5,
  west: 116.0,
  east: 127.0,
}
