"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useNotification } from "@/components/notification-provider"
import { format } from "date-fns"
import { Calendar, Clock, MapPin, AlertCircle, ShieldAlert, Camera, Loader2, CheckCircle, XCircle } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

export default function EmployeeDashboard() {
  const { showNotification } = useNotification()

  const [currentUser, setCurrentUser] = useState<{
    id: number | string
    firstName: string
    surname: string
    status?: string
    branchId?: string | number | null
  } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [todaySchedule, setTodaySchedule] = useState<any | null>(null)
  const [latestTimeRecord, setLatestTimeRecord] = useState<any | null>(null)
  const [assignedBranch, setAssignedBranch] = useState<any | null>(null)
  const [pendingLeaves, setPendingLeaves] = useState<any[]>([])
  const [accountStatus, setAccountStatus] = useState<"pending" | "approved" | "rejected" | undefined>(undefined)

  // Unified clock-in/out modal state
  const [showClockInModal, setShowClockInModal] = useState(false)
  const [showClockOutModal, setShowClockOutModal] = useState(false)
  const [cameraStatus, setCameraStatus] = useState<"waiting" | "active" | "captured" | "error">("waiting")
  const [locationStatus, setLocationStatus] = useState<"checking" | "valid" | "error">("checking")
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null)
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null)

  // Load all data from API endpoints
  useEffect(() => {
    const user = sessionStorage.getItem("currentUser")
    if (!user) return

    try {
      const userData = JSON.parse(user)
      setCurrentUser(userData)
      setAccountStatus(userData.status as any)

      if (userData.status !== "approved") return

      // Fetch all data in parallel
      const fetchAll = async () => {
        try {
          const today = new Date().toISOString().split("T")[0]

          const [branchRes, attendanceRes, leaveRes] = await Promise.all([
            userData.branchId
              ? fetch(`/api/branches?id=${userData.branchId}`).then((r) => r.ok ? r.json() : null)
              : Promise.resolve(null),
            fetch(`/api/attendance?employeeId=${userData.id}&date=${today}`).then((r) => r.ok ? r.json() : []),
            fetch(`/api/leave?employeeId=${userData.id}&status=pending`).then((r) => r.ok ? r.json() : []),
          ])

          setAssignedBranch(branchRes)
          setPendingLeaves(Array.isArray(leaveRes) ? leaveRes : [])

          // Find today's attendance record
          if (Array.isArray(attendanceRes) && attendanceRes.length > 0) {
            setLatestTimeRecord(attendanceRes[0])
          }

          // Fetch schedules and find today's
          try {
            const scheduleRes = await fetch(`/api/schedules?date=${today}`)
            if (scheduleRes.ok) {
              const schedules = await scheduleRes.json()
              // Find this employee's schedule for today
              if (Array.isArray(schedules)) {
                for (const sched of schedules) {
                  if (sched.branchAssignments) {
                    let assignments = sched.branchAssignments
                    if (typeof assignments === "string") {
                      try { assignments = JSON.parse(assignments) } catch { assignments = null }
                    }
                    if (Array.isArray(assignments)) {
                      for (const branch of assignments) {
                        const found = branch.employees?.find(
                          (e: any) => String(e.employeeId) === String(userData.id)
                        )
                        if (found) {
                          const shiftObj = typeof found.shift === "object" && found.shift ? found.shift : null
                          setTodaySchedule({
                            date: sched.scheduleFor || sched.date,
                            startTime: shiftObj?.start || sched.time || "",
                            endTime: shiftObj?.end || "",
                            branchName: branch.branchName || "Unknown",
                            notes: sched.notes || "",
                          })
                          break
                        }
                      }
                    }
                  }
                }
              }
            }
          } catch (err) {
            console.error("Error fetching schedules:", err)
          }
        } catch (err) {
          console.error("Error fetching dashboard data:", err)
        }
      }

      fetchAll()
    } catch (error) {
      console.error("Error loading employee data:", error)
    }
  }, [])

  // --- Unified camera capture (robust, works on mobile + desktop) ---
  const capturePhoto = async (): Promise<boolean> => {
    setCameraStatus("active")

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showNotification("error", "Camera Unavailable", "Camera access is not available. Ensure you are using HTTPS and a supported browser.")
      setCameraStatus("error")
      return false
    }

    try {
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        })
      } catch (constraintError: any) {
        if (constraintError.name === "OverconstrainedError" || constraintError.name === "ConstraintNotSatisfiedError") {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        } else {
          throw constraintError
        }
      }

      const video = document.createElement("video")
      video.setAttribute("autoplay", "")
      video.setAttribute("playsinline", "")
      video.setAttribute("muted", "")
      video.muted = true
      video.srcObject = stream

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Camera timed out")), 10000)
        video.onloadeddata = () => { clearTimeout(timeout); resolve() }
        video.onerror = () => { clearTimeout(timeout); reject(new Error("Video element error")) }
      })

      await video.play()
      await new Promise((resolve) => setTimeout(resolve, 1000))

      if (!video.videoWidth || !video.videoHeight) {
        stream.getTracks().forEach((track) => track.stop())
        showNotification("error", "Camera Error", "Camera started but produced no video frames. Please try again.")
        setCameraStatus("error")
        return false
      }

      const canvas = document.createElement("canvas")
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext("2d")
      if (ctx) ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      const photoDataUrl = canvas.toDataURL("image/jpeg", 0.8)
      setCapturedPhoto(photoDataUrl)
      setCameraStatus("captured")
      stream.getTracks().forEach((track) => track.stop())
      return true
    } catch (cameraError: any) {
      let title = "Camera Error"
      let message = "Could not access camera. Please try again."
      if (cameraError.name === "NotAllowedError" || cameraError.name === "PermissionDeniedError") {
        title = "Camera Permission Denied"
        message = "Camera access was denied. Please allow camera permissions in your browser settings and try again."
      } else if (cameraError.name === "NotFoundError" || cameraError.name === "DevicesNotFoundError") {
        title = "No Camera Found"
        message = "No camera was detected on this device. Please connect a camera and try again."
      } else if (cameraError.name === "NotReadableError" || cameraError.name === "TrackStartError") {
        title = "Camera In Use"
        message = "The camera is already in use by another application. Please close other apps using the camera."
      } else if (cameraError.message === "Camera timed out") {
        title = "Camera Timeout"
        message = "Camera took too long to start. Please check your camera connection and try again."
      }
      console.error("Camera error:", cameraError.name, cameraError.message)
      showNotification("error", title, message)
      setCameraStatus("error")
      return false
    }
  }

  // --- Modal openers ---
  const handleClockInAttempt = () => {
    setShowClockInModal(true)
    setCameraStatus("waiting")
    setLocationStatus("checking")
    setCapturedPhoto(null)
    setCurrentLocation(null)
  }

  const handleClockOutAttempt = () => {
    setShowClockOutModal(true)
    setCameraStatus("waiting")
    setLocationStatus("checking")
    setCapturedPhoto(null)
    setCurrentLocation(null)
  }

  // --- GPS validation (triggered after photo is captured) ---
  const handlePhotoSubmit = async () => {
    if (!capturedPhoto) return
    setLocationStatus("checking")

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) { reject(new Error("Geolocation not supported")); return }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        })
      })
      setCurrentLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      })
      setLocationStatus("valid")
    } catch (error) {
      console.error("GPS validation error:", error)
      setLocationStatus("error")
      showNotification("error", "Location Error", "GPS location is required. Please enable location services.")
    }
  }

  // --- Submit clock-in to API ---
  const submitClockIn = async () => {
    if (!currentUser || !capturedPhoto) return
    setIsLoading(true)
    try {
      const now = new Date()
      const today = now.toISOString().split("T")[0]
      const timeIn = now.toTimeString().slice(0, 8)

      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "clock-in",
          employeeId: currentUser.id,
          employeeName: `${currentUser.firstName} ${currentUser.surname}`,
          date: today,
          status: "present",
          timeIn,
          photoUrl: capturedPhoto,
          latitude: currentLocation?.latitude || null,
          longitude: currentLocation?.longitude || null,
          branchId: currentUser.branchId || null,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.alreadyClockedIn) {
          showNotification("info", "Already Clocked In", `You already clocked in today at ${formatTime(data.timeIn)}.`)
          setLatestTimeRecord((prev: any) => ({ ...prev, date: today, timeIn: data.timeIn, status: "present" }))
        } else {
          setLatestTimeRecord({ date: today, timeIn: data.timeIn || timeIn, status: "present" })
          showNotification("success", "Clocked In", `You have successfully clocked in at ${formatTime(data.timeIn || timeIn)} (photo verified).`)
        }
        setShowClockInModal(false)
      } else {
        const err = await res.json().catch(() => ({}))
        showNotification("error", "Error", err.message || "Failed to clock in. Please try again.")
      }
    } catch (error) {
      console.error("Error clocking in:", error)
      showNotification("error", "Error", "Failed to clock in. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  // --- Submit clock-out to API ---
  const submitClockOut = async () => {
    if (!currentUser || !capturedPhoto) return
    setIsLoading(true)
    try {
      const now = new Date()
      const today = now.toISOString().split("T")[0]
      const timeOut = now.toTimeString().slice(0, 8)

      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "clock-out",
          employeeId: currentUser.id,
          employeeName: `${currentUser.firstName} ${currentUser.surname}`,
          date: today,
          timeOut,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setLatestTimeRecord((prev: any) => ({ ...prev, timeOut: data.timeOut || timeOut }))
        setShowClockOutModal(false)
        showNotification("success", "Clocked Out", `You have successfully clocked out at ${formatTime(data.timeOut || timeOut)}.`)
      } else {
        const err = await res.json().catch(() => ({}))
        showNotification("error", "Error", err.message || "Failed to clock out. Please try again.")
      }
    } catch (error) {
      console.error("Error clocking out:", error)
      showNotification("error", "Error", "Failed to clock out. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const formatTime = (timeString: string) => {
    if (!timeString) return "N/A"

    const [hours, minutes] = timeString.split(":")
    const hour = Number.parseInt(hours, 10)
    const period = hour >= 12 ? "PM" : "AM"
    const formattedHour = hour % 12 || 12
    return `${formattedHour}:${minutes} ${period}`
  }

  // Show account status message if not approved
  if (accountStatus === "pending") {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Employee Dashboard</h1>
          <p className="text-muted-foreground">Welcome, {currentUser?.firstName}!</p>
        </div>

        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <CardHeader>
            <CardTitle className="flex items-center text-amber-800">
              <ShieldAlert className="mr-2 h-6 w-6 text-amber-600" />
              Account Pending Approval
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p>
                Your account is currently pending approval from an administrator. You will be able to access the full
                employee portal once your account has been approved.
              </p>
              <p>Please check back later or contact your administrator for more information.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (accountStatus === "rejected") {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Employee Dashboard</h1>
          <p className="text-muted-foreground">Welcome, {currentUser?.firstName}!</p>
        </div>

        <Card className="border-red-300 bg-red-50 dark:bg-red-950/20">
          <CardHeader>
            <CardTitle className="flex items-center text-red-800">
              <ShieldAlert className="mr-2 h-6 w-6 text-red-600" />
              Account Rejected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p>
                Your account registration has been rejected by an administrator. You will not be able to access the
                employee portal.
              </p>
              <p>Please contact your administrator for more information.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Employee Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {currentUser?.firstName}!</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Today's Schedule */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <Calendar className="mr-2 h-5 w-5 text-primary" />
              Today's Schedule
            </CardTitle>
          </CardHeader>
          <CardContent>
            {todaySchedule ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div className="text-sm text-muted-foreground">Time:</div>
                  <div className="font-medium">
                    {todaySchedule.startTime ? formatTime(todaySchedule.startTime) : "N/A"} -{" "}
                    {todaySchedule.endTime ? formatTime(todaySchedule.endTime) : "N/A"}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-muted-foreground">Branch:</div>
                  <div className="font-medium">{todaySchedule.branchName || assignedBranch?.branchName || "Unassigned"}</div>
                </div>
                {todaySchedule.notes && (
                  <div className="pt-2 border-t">
                    <div className="text-sm text-muted-foreground mb-1">Notes:</div>
                    <div className="text-sm">{todaySchedule.notes}</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-6 text-center text-muted-foreground">No schedule for today</div>
            )}
          </CardContent>
        </Card>

        {/* Time In/Out */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <Clock className="mr-2 h-5 w-5 text-primary" />
              Attendance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="text-sm text-muted-foreground">Status:</div>
                <Badge variant={latestTimeRecord && latestTimeRecord.status === "present" ? "default" : "outline"}>
                  {latestTimeRecord && latestTimeRecord.status === "present" ? "Present" : "Not Clocked In"}
                </Badge>
              </div>

              {latestTimeRecord && (
                <div className="space-y-2">
                  {latestTimeRecord.timeIn && (
                    <div className="flex justify-between items-center">
                      <div className="text-sm text-muted-foreground">Time In:</div>
                      <div className="font-medium">{formatTime(latestTimeRecord.timeIn)}</div>
                    </div>
                  )}

                  {latestTimeRecord.timeOut && (
                    <div className="flex justify-between items-center">
                      <div className="text-sm text-muted-foreground">Time Out:</div>
                      <div className="font-medium">{formatTime(latestTimeRecord.timeOut)}</div>
                    </div>
                  )}
                </div>
              )}

              <div className="pt-2">
                {!latestTimeRecord || latestTimeRecord.status !== "present" ? (
                  <Button className="w-full" onClick={handleClockInAttempt} disabled={isLoading}>
                    <Camera className="mr-2 h-4 w-4" />
                    Clock In
                  </Button>
                ) : !latestTimeRecord.timeOut ? (
                  <Button className="w-full" variant="outline" onClick={handleClockOutAttempt} disabled={isLoading}>
                    <Camera className="mr-2 h-4 w-4" />
                    Clock Out
                  </Button>
                ) : (
                  <div className="text-center text-sm text-muted-foreground">
                    Attendance complete for today
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Branch Information */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <MapPin className="mr-2 h-5 w-5 text-primary" />
              Assigned Branch
            </CardTitle>
          </CardHeader>
          <CardContent>
            {assignedBranch ? (
              <div className="space-y-4">
                <div className="font-medium text-lg">{assignedBranch.branchName}</div>
                <div className="text-sm text-muted-foreground">{assignedBranch.address}</div>
              </div>
            ) : (
              <div className="py-6 text-center text-muted-foreground">You are not assigned to any branch</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pending Leave Requests */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Pending Leave Requests</CardTitle>
          </CardHeader>
          <CardContent>
            {pendingLeaves.length > 0 ? (
              <div className="space-y-4">
                {pendingLeaves.map((leave: any, idx: number) => (
                  <div key={leave.id || idx} className="p-3 border rounded-md">
                    <div className="flex justify-between">
                      <div className="font-medium capitalize">
                        {leave.type || "General"} Leave
                      </div>
                      <Badge variant="outline">Pending</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {leave.startDate} — {leave.endDate}
                    </div>
                    {leave.reason && (
                      <div className="mt-2 text-sm">
                        <span className="text-muted-foreground">Reason: </span>
                        {leave.reason}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-muted-foreground">No pending leave requests</div>
            )}
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <AlertCircle className="mr-2 h-5 w-5 text-primary" />
              Quick Info
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-3 border rounded-md">
                <div className="font-medium">Today</div>
                <div className="text-sm mt-1">{format(new Date(), "EEEE, MMMM d, yyyy")}</div>
              </div>
              {assignedBranch && (
                <div className="p-3 border rounded-md">
                  <div className="font-medium">Your Branch</div>
                  <div className="text-sm mt-1">{assignedBranch.branchName}</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Clock-In Verification Modal */}
      <Dialog open={showClockInModal} onOpenChange={setShowClockInModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clock In Verification</DialogTitle>
            <DialogDescription>Take a selfie photo, then we'll verify your location</DialogDescription>
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
                  <img src={capturedPhoto} alt="Captured selfie" className="w-32 h-32 object-cover rounded-md mx-auto" />
                  <Button variant="outline" size="sm" onClick={capturePhoto} className="w-full">Retake Photo</Button>
                </div>
              )}
              {cameraStatus === "error" && (
                <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-md">
                  <p className="text-sm text-red-800 dark:text-red-200">Unable to access camera. Please allow camera permissions and try again.</p>
                  <Button variant="outline" size="sm" className="mt-2" onClick={capturePhoto}>Retry Camera Access</Button>
                </div>
              )}
            </div>
            {cameraStatus === "captured" && locationStatus === "checking" && (
              <Button onClick={handlePhotoSubmit} className="w-full">Submit Photo</Button>
            )}
            {cameraStatus === "captured" && locationStatus !== "checking" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">2. Location Verification</h4>
                  {locationStatus === "valid" && <CheckCircle className="h-4 w-4 text-green-600" />}
                  {locationStatus === "error" && <AlertCircle className="h-4 w-4 text-amber-600" />}
                </div>
                {locationStatus === "valid" && (
                  <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-md">
                    <p className="text-sm text-green-800 dark:text-green-200">✓ GPS location verified</p>
                  </div>
                )}
                {locationStatus === "error" && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-md">
                    <p className="text-sm text-amber-800 dark:text-amber-200">Location access required. Please enable location permissions.</p>
                    <Button variant="outline" size="sm" className="mt-2" onClick={handlePhotoSubmit}>Retry Location Check</Button>
                  </div>
                )}
              </div>
            )}
            <div className="pt-4 border-t">
              <Button onClick={submitClockIn} disabled={locationStatus !== "valid" || cameraStatus !== "captured" || isLoading} className="w-full">
                {isLoading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</>) : "Confirm Clock In"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Clock-Out Verification Modal */}
      <Dialog open={showClockOutModal} onOpenChange={setShowClockOutModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clock Out Verification</DialogTitle>
            <DialogDescription>Take a selfie photo to verify your clock-out</DialogDescription>
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
                  <img src={capturedPhoto} alt="Captured selfie" className="w-32 h-32 object-cover rounded-md mx-auto" />
                  <Button variant="outline" size="sm" onClick={capturePhoto} className="w-full">Retake Photo</Button>
                </div>
              )}
              {cameraStatus === "error" && (
                <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-md">
                  <p className="text-sm text-red-800 dark:text-red-200">Unable to access camera. Please allow camera permissions and try again.</p>
                  <Button variant="outline" size="sm" className="mt-2" onClick={capturePhoto}>Retry Camera Access</Button>
                </div>
              )}
            </div>
            {cameraStatus === "captured" && locationStatus === "checking" && (
              <Button onClick={handlePhotoSubmit} className="w-full">Submit Photo</Button>
            )}
            {cameraStatus === "captured" && locationStatus !== "checking" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">2. Location Verification</h4>
                  {locationStatus === "valid" && <CheckCircle className="h-4 w-4 text-green-600" />}
                  {locationStatus === "error" && <AlertCircle className="h-4 w-4 text-amber-600" />}
                </div>
                {locationStatus === "valid" && (
                  <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-md">
                    <p className="text-sm text-green-800 dark:text-green-200">✓ GPS location verified</p>
                  </div>
                )}
                {locationStatus === "error" && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-md">
                    <p className="text-sm text-amber-800 dark:text-amber-200">Location access required. Please enable location permissions.</p>
                    <Button variant="outline" size="sm" className="mt-2" onClick={handlePhotoSubmit}>Retry Location Check</Button>
                  </div>
                )}
              </div>
            )}
            <div className="pt-4 border-t">
              <Button onClick={submitClockOut} disabled={locationStatus !== "valid" || cameraStatus !== "captured" || isLoading} className="w-full">
                {isLoading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</>) : "Confirm Clock Out"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
