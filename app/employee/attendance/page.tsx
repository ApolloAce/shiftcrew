"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useNotification } from "@/components/notification-provider"
import { useCrewStore } from "@/lib/cleanStore"
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from "date-fns"
import { Calendar, Clock, AlertCircle, MapPin, Camera, CheckCircle, XCircle, Loader2 } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

interface LocationData {
  latitude: number
  longitude: number
  accuracy: number
  timestamp: number
  capturedWithPhoto?: boolean
  photoTimestamp?: number
}

interface AttendanceRecord {
  id: number
  crewId: number
  date: string
  timeIn: string
  timeOut?: string
  location: LocationData
  photoUrl: string
  status: "present" | "absent" | "late"
  verificationMethod?: "gps_photo"
}

const BRANCH_LOCATIONS = {
  1: { lat: 14.4791, lng: 120.9899, name: "Branch 1", radius: 100 }, // 100 meters radius
  2: { lat: 14.4801, lng: 120.9909, name: "Branch 2", radius: 100 },
  3: { lat: 14.4811, lng: 120.9919, name: "Branch 3", radius: 100 },
  4: { lat: 14.4821, lng: 120.9929, name: "Branch 4", radius: 100 },
  5: { lat: 14.4831, lng: 120.9939, name: "Branch 5", radius: 100 },
  6: { lat: 14.4841, lng: 120.9949, name: "Branch 6", radius: 100 },
}

export default function EmployeeAttendancePage() {
  const { showNotification } = useNotification()
  const { getTimeRecordsForCrew, getLatestTimeRecord, clockIn, clockOut, addTimeRecord, addNotification } =
    useCrewStore()

  const [currentUser, setCurrentUser] = useState<{ id: number; firstName: string; surname: string } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [timeRecords, setTimeRecords] = useState<any[]>([])
  const [latestTimeRecord, setLatestTimeRecord] = useState<any | null>(null)
  const [activeTab, setActiveTab] = useState("clock")
  const [issueNote, setIssueNote] = useState("")

  const [showClockInModal, setShowClockInModal] = useState(false)
  const [showClockOutModal, setShowClockOutModal] = useState(false)
  const [locationStatus, setLocationStatus] = useState<"checking" | "valid" | "invalid" | "error">("checking")
  const [cameraStatus, setCameraStatus] = useState<"waiting" | "active" | "captured" | "error">("waiting")
  const [currentLocation, setCurrentLocation] = useState<LocationData | null>(null)
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null)
  const [assignedBranch, setAssignedBranch] = useState<number>(1) // Mock assigned branch

  useEffect(() => {
    // Get current user from session storage
    const user = sessionStorage.getItem("currentUser")
    if (!user) return

    try {
      const userData = JSON.parse(user)
      setCurrentUser(userData)

      if (userData.id) {
        // Get time records
        const records = getTimeRecordsForCrew(userData.id)
        setTimeRecords(records)

        // Get latest time record
        const latestRecord = getLatestTimeRecord(userData.id)
        setLatestTimeRecord(latestRecord)
      }
    } catch (error) {
      console.error("Error loading attendance data:", error)
    }
  }, [getLatestTimeRecord, getTimeRecordsForCrew])

  const validateLocation = async (): Promise<boolean> => {
    setLocationStatus("checking")

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000,
        })
      })

      const currentLoc: LocationData = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: Date.now(),
      }

      setCurrentLocation(currentLoc)

      // Check if within branch radius
      const branchLocation = BRANCH_LOCATIONS[assignedBranch as keyof typeof BRANCH_LOCATIONS]
      const distance = calculateDistance(
        currentLoc.latitude,
        currentLoc.longitude,
        branchLocation.lat,
        branchLocation.lng,
      )

      if (distance <= branchLocation.radius) {
        setLocationStatus("valid")
        return true
      } else {
        setLocationStatus("invalid")
        return false
      }
    } catch (error) {
      console.error("Location error:", error)
      setLocationStatus("error")
      return false
    }
  }

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3 // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180
    const φ2 = (lat2 * Math.PI) / 180
    const Δφ = ((lat2 - lat1) * Math.PI) / 180
    const Δλ = ((lon2 - lon1) * Math.PI) / 180

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return R * c // Distance in meters
  }

  const capturePhoto = async (): Promise<boolean> => {
    setCameraStatus("active")

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      })

      // Create video element to capture photo
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
      setCapturedPhoto(photoDataUrl)

      setCameraStatus("captured")

      // Stop camera stream
      stream.getTracks().forEach((track) => track.stop())

      console.log("[v0] Photo captured successfully")

      return true
    } catch (error) {
      console.error("Camera error:", error)
      setCameraStatus("error")

      if (error instanceof Error && error.name === "NotAllowedError") {
        showNotification(
          "error",
          "Camera Error",
          "Camera access denied. Please allow camera permissions in your browser settings and try again.",
        )
      } else {
        showNotification(
          "error",
          "Camera Error",
          "Unable to access camera. Please check your camera permissions and try again.",
        )
      }

      return false
    }
  }

  const handleClockInAttempt = () => {
    setShowClockInModal(true)
    setLocationStatus("checking")
    setCameraStatus("waiting")
    setCapturedPhoto(null)
    setCurrentLocation(null)
  }

  const handleClockOutAttempt = () => {
    setShowClockOutModal(true)
    setLocationStatus("checking")
    setCameraStatus("waiting")
    setCapturedPhoto(null)
    setCurrentLocation(null)
  }

  const handlePhotoSubmit = async () => {
    if (!capturedPhoto) return

    setLocationStatus("checking")

    try {
      // Get GPS location after photo is taken
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error("Geolocation is not supported by this browser"))
          return
        }

        navigator.geolocation.getCurrentPosition(
          resolve,
          (error) => {
            // Handle different types of geolocation errors
            switch (error.code) {
              case error.PERMISSION_DENIED:
                reject(
                  new Error(
                    "Location access denied. Please enable location permissions in your browser settings and try again.",
                  ),
                )
                break
              case error.POSITION_UNAVAILABLE:
                reject(new Error("Location information is unavailable. Please check your GPS/location services."))
                break
              case error.TIMEOUT:
                reject(new Error("Location request timed out. Please try again."))
                break
              default:
                reject(new Error("An unknown error occurred while retrieving location."))
                break
            }
          },
          {
            enableHighAccuracy: true,
            timeout: 15000, // Increased timeout to 15 seconds
            maximumAge: 0, // Force fresh GPS reading
          },
        )
      })

      const photoLocation: LocationData = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: Date.now(),
        capturedWithPhoto: true,
        photoTimestamp: Date.now(),
      }

      setCurrentLocation(photoLocation)

      // Check if within branch radius
      const branchLocation = BRANCH_LOCATIONS[assignedBranch as keyof typeof BRANCH_LOCATIONS]
      const distance = calculateDistance(
        photoLocation.latitude,
        photoLocation.longitude,
        branchLocation.lat,
        branchLocation.lng,
      )

      if (distance <= branchLocation.radius) {
        setLocationStatus("valid")
        return true
      } else {
        setLocationStatus("invalid")
        return false
      }
    } catch (error) {
      console.error("GPS validation error:", error)
      setLocationStatus("error")

      if (error instanceof Error) {
        showNotification("error", "Location Error", error.message)
      } else {
        showNotification(
          "error",
          "Location Error",
          "Unable to access your location. Please enable location services and try again.",
        )
      }

      return false
    }
  }

  const submitClockIn = async () => {
    if (!currentUser || !currentLocation || !capturedPhoto) return

    setIsLoading(true)
    try {
      clockIn(currentUser.id)
      const updatedRecord = getLatestTimeRecord(currentUser.id)
      setLatestTimeRecord(updatedRecord)

      const records = getTimeRecordsForCrew(currentUser.id)
      setTimeRecords(records)

      setShowClockInModal(false)
      showNotification("success", "Clock In Success", "You have successfully clocked in!")
    } catch (error) {
      console.error("Error clocking in:", error)
      showNotification("error", "Error", "Failed to clock in. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const submitClockOut = async () => {
    if (!currentUser || !currentLocation || !capturedPhoto) return

    setIsLoading(true)
    try {
      clockOut(currentUser.id)
      const updatedRecord = getLatestTimeRecord(currentUser.id)
      setLatestTimeRecord(updatedRecord)

      const records = getTimeRecordsForCrew(currentUser.id)
      setTimeRecords(records)

      setShowClockOutModal(false)
      showNotification("success", "Clock Out Success", "You have successfully clocked out!")
    } catch (error) {
      console.error("Error clocking out:", error)
      showNotification("error", "Error", "Failed to clock out. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleReportIssue = () => {
    if (!currentUser || !issueNote.trim()) return

    setIsLoading(true)
    try {
      // Add notification for admin
      addNotification({
        recipientId: null, // All admins
        title: "Attendance Issue Reported",
        message: `${currentUser.firstName} ${currentUser.surname} reported an attendance issue: ${issueNote}`,
        type: "warning",
      })

      setIssueNote("")
      showNotification("success", "Issue Reported", "Your attendance issue has been reported to the administrator.")
    } catch (error) {
      console.error("Error reporting issue:", error)
      showNotification("error", "Error", "Failed to report issue. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const formatTime = (timeString: string | undefined) => {
    if (!timeString) return "N/A"

    const [hours, minutes] = timeString.split(":")
    const hour = Number.parseInt(hours, 10)
    const period = hour >= 12 ? "PM" : "AM"
    const formattedHour = hour % 12 || 12
    return `${formattedHour}:${minutes} ${period}`
  }

  // Calculate monthly attendance data
  const today = new Date()
  const startDate = startOfMonth(today)
  const endDate = endOfMonth(today)
  const daysInMonth = eachDayOfInterval({ start: startDate, end: endDate })

  const getAttendanceForDay = (date: Date) => {
    return timeRecords.find((record) => {
      const recordDate = parseISO(record.date)
      return isSameDay(recordDate, date)
    })
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Attendance</h1>
        <p className="text-muted-foreground">Manage your attendance with GPS and photo verification</p>
      </div>

      <Tabs defaultValue="clock" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="clock">Clock In/Out</TabsTrigger>
          <TabsTrigger value="history">Attendance History</TabsTrigger>
          <TabsTrigger value="report">Report Issue</TabsTrigger>
        </TabsList>

        <TabsContent value="clock" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Clock className="mr-2 h-5 w-5 text-primary" />
                Time Clock with Verification
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-md border border-blue-200 dark:border-blue-800">
                  <h4 className="font-medium mb-2 flex items-center text-blue-800 dark:text-blue-200">
                    <MapPin className="mr-2 h-5 w-5 text-blue-600" />
                    Location Requirement
                  </h4>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    Please ensure your phone's location services are enabled before clocking in or out. GPS location is
                    required for attendance verification.
                  </p>
                </div>

                <div className="text-center">
                  <div className="text-4xl font-bold mb-2">{format(new Date(), "h:mm a")}</div>
                  <div className="text-lg text-muted-foreground">{format(new Date(), "EEEE, MMMM d, yyyy")}</div>
                </div>

                <div className="flex justify-center">
                  <div className="text-center p-4 border rounded-md bg-blue-50 dark:bg-blue-950/20">
                    <div className="text-sm text-muted-foreground mb-1">Assigned Branch</div>
                    <div className="font-medium flex items-center">
                      <MapPin className="mr-1 h-4 w-4" />
                      {BRANCH_LOCATIONS[assignedBranch as keyof typeof BRANCH_LOCATIONS]?.name}
                    </div>
                  </div>
                </div>

                <div className="flex justify-center items-center gap-4">
                  <div className="text-center p-4 border rounded-md flex-1">
                    <div className="text-sm text-muted-foreground mb-1">Status</div>
                    <Badge
                      variant={latestTimeRecord && !latestTimeRecord.timeOut ? "default" : "outline"}
                      className="text-lg px-3 py-1"
                    >
                      {latestTimeRecord && !latestTimeRecord.timeOut ? "Clocked In" : "Clocked Out"}
                    </Badge>
                  </div>

                  {latestTimeRecord && (
                    <div className="text-center p-4 border rounded-md flex-1">
                      <div className="text-sm text-muted-foreground mb-1">
                        {latestTimeRecord.timeOut ? "Last Shift" : "Current Shift"}
                      </div>
                      <div className="font-medium">
                        {formatTime(latestTimeRecord.timeIn)}
                        {latestTimeRecord.timeOut && ` - ${formatTime(latestTimeRecord.timeOut)}`}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-center gap-4">
                  <Button size="lg" className="w-40" onClick={handleClockInAttempt} disabled={isLoading}>
                    <Camera className="mr-2 h-4 w-4" />
                    Clock In
                  </Button>

                  <Button
                    size="lg"
                    variant="outline"
                    className="w-40 bg-transparent"
                    onClick={handleClockOutAttempt}
                    disabled={isLoading || !latestTimeRecord || latestTimeRecord.timeOut}
                  >
                    <Camera className="mr-2 h-4 w-4" />
                    Clock Out
                  </Button>
                </div>

                <div className="bg-amber-50 dark:bg-amber-950/20 p-4 rounded-md">
                  <h4 className="font-medium mb-2 flex items-center">
                    <AlertCircle className="mr-2 h-4 w-4 text-amber-600" />
                    Verification Requirements
                  </h4>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li className="flex items-center">
                      <MapPin className="mr-2 h-4 w-4 text-blue-600" />
                      Enable your phone's location services before clocking in/out
                    </li>
                    <li>• Must be within 100 meters of your assigned branch</li>
                    <li>• GPS location will be recorded with your attendance</li>
                    <li>• Selfie photo required for identity verification</li>
                    <li>• All data is securely stored with your attendance record</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Calendar className="mr-2 h-5 w-5 text-primary" />
                Monthly Attendance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                <h3 className="text-lg font-medium mb-2">{format(today, "MMMM yyyy")}</h3>
                <div className="grid grid-cols-7 gap-2">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                    <div key={day} className="text-center font-medium text-sm p-2">
                      {day}
                    </div>
                  ))}

                  {daysInMonth.map((day, i) => {
                    const attendance = getAttendanceForDay(day)
                    let bgColor = "bg-gray-100 dark:bg-gray-800"

                    if (attendance) {
                      bgColor = attendance.timeOut
                        ? "bg-green-100 dark:bg-green-900/30"
                        : "bg-yellow-100 dark:bg-yellow-900/30"
                    }

                    if (isSameDay(day, today)) {
                      bgColor += " border-2 border-primary"
                    }

                    return (
                      <div key={i} className={`text-center p-2 rounded-md ${bgColor}`}>
                        <div className="text-sm">{format(day, "d")}</div>
                        {attendance && <div className="text-xs mt-1">{attendance.timeOut ? "✓" : "⌛"}</div>}
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-medium">Recent Records</h3>
                {timeRecords.length > 0 ? (
                  <div className="space-y-3">
                    {timeRecords
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .slice(0, 5)
                      .map((record) => (
                        <div key={record.id} className="flex justify-between items-center p-3 border rounded-md">
                          <div>
                            <div className="font-medium">{format(parseISO(record.date), "EEEE, MMMM d, yyyy")}</div>
                            <div className="text-sm text-muted-foreground">
                              {formatTime(record.timeIn)} -{" "}
                              {record.timeOut ? formatTime(record.timeOut) : "Not clocked out"}
                            </div>
                          </div>
                          <Badge variant={record.timeOut ? "default" : "outline"}>
                            {record.timeOut ? "Complete" : "In Progress"}
                          </Badge>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">No attendance records found</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="report" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <AlertCircle className="mr-2 h-5 w-5 text-primary" />
                Report Attendance Issue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  Use this form to report any attendance issues, such as forgotten clock-ins or clock-outs.
                </div>

                <div className="space-y-2">
                  <Label htmlFor="issueNote">Describe the Issue</Label>
                  <Textarea
                    id="issueNote"
                    placeholder="e.g., I forgot to clock in on Monday, May 15th. I arrived at 9:00 AM."
                    value={issueNote}
                    onChange={(e) => setIssueNote(e.target.value)}
                    rows={5}
                  />
                </div>

                <Button onClick={handleReportIssue} disabled={isLoading || !issueNote.trim()} className="w-full">
                  Submit Report
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showClockInModal} onOpenChange={setShowClockInModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clock In Verification</DialogTitle>
            <DialogDescription>Take a photo first, then we'll verify your location</DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">1. Take Photo</h4>
                {cameraStatus === "waiting" && <Clock className="h-4 w-4 text-gray-400" />}
                {cameraStatus === "active" && <Loader2 className="h-4 w-4 animate-spin" />}
                {cameraStatus === "captured" && <CheckCircle className="h-4 w-4 text-green-600" />}
                {cameraStatus === "error" && <XCircle className="h-4 w-4 text-red-600" />}
              </div>

              {cameraStatus === "waiting" && (
                <Button onClick={capturePhoto} className="w-full">
                  <Camera className="mr-2 h-4 w-4" />
                  Take Selfie
                </Button>
              )}

              {cameraStatus === "active" && <p className="text-sm text-muted-foreground">Accessing camera...</p>}

              {cameraStatus === "captured" && capturedPhoto && (
                <div className="space-y-2">
                  <p className="text-sm text-green-600">✓ Photo captured successfully</p>
                  <img
                    src={capturedPhoto || "/placeholder.svg"}
                    alt="Captured selfie"
                    className="w-32 h-32 object-cover rounded-md mx-auto"
                  />
                  <Button variant="outline" size="sm" onClick={capturePhoto} className="w-full bg-transparent">
                    Retake Photo
                  </Button>
                </div>
              )}

              {cameraStatus === "error" && (
                <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-md">
                  <p className="text-sm text-red-800 dark:text-red-200">
                    ✗ Unable to access camera. Please allow camera permissions and try again.
                  </p>
                  <Button variant="outline" size="sm" className="mt-2 bg-transparent" onClick={capturePhoto}>
                    Retry Camera Access
                  </Button>
                </div>
              )}
            </div>

            {cameraStatus === "captured" && locationStatus === "checking" && (
              <Button onClick={handlePhotoSubmit} className="w-full">
                Submit Photo
              </Button>
            )}

            {cameraStatus === "captured" && locationStatus !== "checking" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">2. Location Verification</h4>
                  {locationStatus === "valid" && <CheckCircle className="h-4 w-4 text-green-600" />}
                  {locationStatus === "invalid" && <XCircle className="h-4 w-4 text-red-600" />}
                  {locationStatus === "error" && <AlertCircle className="h-4 w-4 text-amber-600" />}
                </div>

                {locationStatus === "valid" && (
                  <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-md">
                    <p className="text-sm text-green-800 dark:text-green-200">
                      ✓ GPS location verified for{" "}
                      {BRANCH_LOCATIONS[assignedBranch as keyof typeof BRANCH_LOCATIONS]?.name}
                    </p>
                  </div>
                )}

                {locationStatus === "invalid" && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-md">
                    <p className="text-sm text-red-800 dark:text-red-200">
                      ✗ You are not at the correct branch location. Please move to{" "}
                      {BRANCH_LOCATIONS[assignedBranch as keyof typeof BRANCH_LOCATIONS]?.name} and try again.
                    </p>
                  </div>
                )}

                {locationStatus === "error" && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-md">
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      ⚠ Location access required. Please enable location permissions in your browser settings and try
                      again.
                    </p>
                    <Button variant="outline" size="sm" className="mt-2 bg-transparent" onClick={handlePhotoSubmit}>
                      Retry Location Check
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="pt-4 border-t">
              <Button
                onClick={submitClockIn}
                disabled={locationStatus !== "valid" || cameraStatus !== "captured" || isLoading}
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Clock In"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showClockOutModal} onOpenChange={setShowClockOutModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clock Out Verification</DialogTitle>
            <DialogDescription>Take a photo first, then we'll verify your location</DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">1. Take Photo</h4>
                {cameraStatus === "waiting" && <Clock className="h-4 w-4 text-gray-400" />}
                {cameraStatus === "active" && <Loader2 className="h-4 w-4 animate-spin" />}
                {cameraStatus === "captured" && <CheckCircle className="h-4 w-4 text-green-600" />}
                {cameraStatus === "error" && <XCircle className="h-4 w-4 text-red-600" />}
              </div>

              {cameraStatus === "waiting" && (
                <Button onClick={capturePhoto} className="w-full">
                  <Camera className="mr-2 h-4 w-4" />
                  Take Selfie
                </Button>
              )}

              {cameraStatus === "active" && <p className="text-sm text-muted-foreground">Accessing camera...</p>}

              {cameraStatus === "captured" && capturedPhoto && (
                <div className="space-y-2">
                  <p className="text-sm text-green-600">✓ Photo captured successfully</p>
                  <img
                    src={capturedPhoto || "/placeholder.svg"}
                    alt="Captured selfie"
                    className="w-32 h-32 object-cover rounded-md mx-auto"
                  />
                  <Button variant="outline" size="sm" onClick={capturePhoto} className="w-full bg-transparent">
                    Retake Photo
                  </Button>
                </div>
              )}

              {cameraStatus === "error" && (
                <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-md">
                  <p className="text-sm text-red-800 dark:text-red-200">
                    ✗ Unable to access camera. Please allow camera permissions and try again.
                  </p>
                  <Button variant="outline" size="sm" className="mt-2 bg-transparent" onClick={capturePhoto}>
                    Retry Camera Access
                  </Button>
                </div>
              )}
            </div>

            {cameraStatus === "captured" && locationStatus === "checking" && (
              <Button onClick={handlePhotoSubmit} className="w-full">
                Submit Photo
              </Button>
            )}

            {cameraStatus === "captured" && locationStatus !== "checking" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">2. Location Verification</h4>
                  {locationStatus === "valid" && <CheckCircle className="h-4 w-4 text-green-600" />}
                  {locationStatus === "invalid" && <XCircle className="h-4 w-4 text-red-600" />}
                  {locationStatus === "error" && <AlertCircle className="h-4 w-4 text-amber-600" />}
                </div>

                {locationStatus === "valid" && (
                  <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-md">
                    <p className="text-sm text-green-800 dark:text-green-200">
                      ✓ GPS location verified for{" "}
                      {BRANCH_LOCATIONS[assignedBranch as keyof typeof BRANCH_LOCATIONS]?.name}
                    </p>
                  </div>
                )}

                {locationStatus === "invalid" && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-md">
                    <p className="text-sm text-red-800 dark:text-red-200">
                      ✗ You are not at the correct branch location. Please move to{" "}
                      {BRANCH_LOCATIONS[assignedBranch as keyof typeof BRANCH_LOCATIONS]?.name} and try again.
                    </p>
                  </div>
                )}

                {locationStatus === "error" && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-md">
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      ⚠ Location access required. Please enable location permissions in your browser settings and try
                      again.
                    </p>
                    <Button variant="outline" size="sm" className="mt-2 bg-transparent" onClick={handlePhotoSubmit}>
                      Retry Location Check
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="pt-4 border-t">
              <Button
                onClick={submitClockOut}
                disabled={locationStatus !== "valid" || cameraStatus !== "captured" || isLoading}
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Clock Out"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
