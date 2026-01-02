export interface LocationData {
  latitude: number
  longitude: number
  accuracy: number
  timestamp: number
}

export interface BranchLocation {
  id: number
  name: string
  latitude: number
  longitude: number
  radius: number
}

export interface AttendanceRecord {
  id: number
  crewId: number
  date: string
  timeIn?: string
  timeOut?: string
  location: LocationData
  photoUrl: string
  branchId: number
  status: "present" | "absent" | "late"
  createdAt: string
}

export class AttendanceService {
  // Validate if employee is within branch location
  static validateLocation(currentLocation: LocationData, branchLocation: BranchLocation): boolean {
    const distance = this.calculateDistance(
      currentLocation.latitude,
      currentLocation.longitude,
      branchLocation.latitude,
      branchLocation.longitude,
    )

    return distance <= branchLocation.radius
  }

  // Calculate distance between two GPS coordinates
  static calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3 // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180
    const φ2 = (lat2 * Math.PI) / 180
    const Δφ = ((lat2 - lat1) * Math.PI) / 180
    const Δλ = ((lon2 - lon1) * Math.PI) / 180

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return R * c // Distance in meters
  }

  // Get current GPS location
  static async getCurrentLocation(): Promise<LocationData> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported"))
        return
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: Date.now(),
          })
        },
        (error) => {
          reject(error)
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000,
        },
      )
    })
  }

  // Capture photo from camera
  static async capturePhoto(): Promise<string> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      })

      const video = document.createElement("video")
      video.srcObject = stream
      video.play()

      // Wait for video to be ready
      await new Promise((resolve) => {
        video.onloadedmetadata = resolve
      })

      // Create canvas to capture frame
      const canvas = document.createElement("canvas")
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext("2d")
      ctx?.drawImage(video, 0, 0)

      // Convert to base64
      const photoDataUrl = canvas.toDataURL("image/jpeg", 0.8)

      // Stop camera stream
      stream.getTracks().forEach((track) => track.stop())

      return photoDataUrl
    } catch (error) {
      throw new Error("Failed to capture photo")
    }
  }

  // Save attendance record to database
  static async saveAttendanceRecord(record: Omit<AttendanceRecord, "id" | "createdAt">): Promise<AttendanceRecord> {
    // This would be implemented with your actual database
    const newRecord: AttendanceRecord = {
      ...record,
      id: Date.now(),
      createdAt: new Date().toISOString(),
    }

    console.log("[v0] Saving attendance record to database:", newRecord)

    // In a real implementation, this would:
    // 1. Save to enhanced_attendance table
    // 2. Upload photo to cloud storage
    // 3. Save photo reference to attendance_photos table
    // 4. Return the saved record with database ID

    return newRecord
  }

  // Get attendance records for employee
  static async getAttendanceRecords(
    crewId: number,
    dateRange?: { start: string; end: string },
  ): Promise<AttendanceRecord[]> {
    // This would query the enhanced_attendance table
    console.log("[v0] Fetching attendance records for crew:", crewId, dateRange)

    // Mock implementation - in real app, this would be a database query
    return []
  }
}
