/**
 * Client-side geolocation helper for location-based attendance.
 * Provides accurate GPS with fallback, accuracy checks, and basic anti-spoof measures.
 */

export interface GeoResult {
  latitude: number
  longitude: number
  accuracy: number // meters
  timestamp: number
}

export interface GeoError {
  code: "PERMISSION_DENIED" | "POSITION_UNAVAILABLE" | "TIMEOUT" | "NOT_SUPPORTED" | "LOW_ACCURACY"
  message: string
}

/**
 * Get the user's current position with high accuracy.
 * Retries once with relaxed settings if the first attempt fails.
 */
export async function getCurrentPosition(): Promise<GeoResult> {
  if (!navigator.geolocation) {
    throw {
      code: "NOT_SUPPORTED",
      message: "Geolocation is not supported by your browser. Please use a modern browser with location services.",
    } as GeoError
  }

  // First attempt: high accuracy (uses GPS on mobile)
  try {
    const pos = await getPositionPromise({
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    })
    return mapPosition(pos)
  } catch (firstError: any) {
    // If permission denied, don't retry
    if (firstError?.code === 1) {
      throw {
        code: "PERMISSION_DENIED",
        message: "Location access was denied. Please enable location permissions in your browser settings and try again.",
      } as GeoError
    }

    // Second attempt: relaxed accuracy (falls back to WiFi/IP)
    try {
      const pos = await getPositionPromise({
        enableHighAccuracy: false,
        timeout: 20000,
        maximumAge: 30000,
      })
      return mapPosition(pos)
    } catch (secondError: any) {
      if (secondError?.code === 1) {
        throw {
          code: "PERMISSION_DENIED",
          message: "Location access was denied. Please enable location permissions in your browser settings and try again.",
        } as GeoError
      }
      if (secondError?.code === 2) {
        throw {
          code: "POSITION_UNAVAILABLE",
          message: "Unable to determine your location. Please ensure GPS/location services are enabled on your device.",
        } as GeoError
      }
      throw {
        code: "TIMEOUT",
        message: "Location request timed out. Please move to an area with better signal and try again.",
      } as GeoError
    }
  }
}

function getPositionPromise(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options)
  })
}

function mapPosition(pos: GeolocationPosition): GeoResult {
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
    timestamp: pos.timestamp,
  }
}

/**
 * Basic anti-spoof checks on the geolocation result.
 * Returns warnings if the reading looks suspicious.
 */
export function checkSpoofIndicators(result: GeoResult): string[] {
  const warnings: string[] = []

  // Accuracy too perfect (< 1m) is suspicious on most devices
  if (result.accuracy < 1) {
    warnings.push("Suspiciously high accuracy detected")
  }

  // Accuracy too poor (> 500m) suggests no real GPS fix
  if (result.accuracy > 500) {
    warnings.push("GPS accuracy is very low — location may be unreliable")
  }

  // Coordinates at exactly 0,0 (null island) are suspicious
  if (result.latitude === 0 && result.longitude === 0) {
    warnings.push("Coordinates are at null island (0,0)")
  }

  return warnings
}
