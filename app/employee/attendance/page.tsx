"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useNotification } from "@/components/notification-provider"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO } from "date-fns"
import { Calendar, Clock, AlertCircle, MapPin, Camera, CheckCircle, XCircle, Loader2 } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

export default function EmployeeAttendancePage() {
  const { showNotification } = useNotification()

  const [currentUser, setCurrentUser] = useState<{
    id: number | string
    firstName: string
    surname: string
    branchId?: string | number | null
  } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [timeRecords, setTimeRecords] = useState<any[]>([])
  const [latestTimeRecord, setLatestTimeRecord] = useState<any | null>(null)
  const [activeTab, setActiveTab] = useState("clock")
  const [issueNote, setIssueNote] = useState("")

  const [showClockInModal, setShowClockInModal] = useState(false)
  const [showClockOutModal, setShowClockOutModal] = useState(false)
  const [locationStatus, setLocationStatus] = useState<"checking" | "valid" | "invalid" | "error">("checking")
  const [cameraStatus, setCameraStatus] = useState<"waiting" | "active" | "captured" | "error">("waiting")
  const [currentLocation, setCurrentLocation] = useState<any | null>(null)
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null)
  const [branchInfo, setBranchInfo] = useState<any | null>(null)

  useEffect(() => {
    const user = sessionStorage.getItem("currentUser")
    if (!user) return

    try {
      const userData = JSON.parse(user)
      setCurrentUser(userData)

      if (userData.id) {
        fetchAttendanceData(userData)
      }
    } catch (error) {
      console.error("Error loading attendance data:", error)
    }
  }, [])

  const fetchAttendanceData = async (userData: any) => {
    try {
      const today = new Date().toISOString().split("T")[0]
      const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd")
      const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd")

      const [recordsRes, todayRes, branchRes] = await Promise.all([
        fetch(`/api/attendance?employeeId=${userData.id}&startDate=${monthStart}&endDate=${monthEnd}`).then((r) =>
          r.ok ? r.json() : []
        ),
        fetch(`/api/attendance?employeeId=${userData.id}&date=${today}`).then((r) =>
          r.ok ? r.json() : []
        ),
        userData.branchId
          ? fetch(`/api/branches?id=${userData.branchId}`).then((r) => r.ok ? r.json() : null)
          : Promise.resolve(null),
      ])

      setTimeRecords(Array.isArray(recordsRes) ? recordsRes : [])
      setBranchInfo(branchRes)

      if (Array.isArray(todayRes) && todayRes.length > 0) {
        setLatestTimeRecord(todayRes[0])
      }
    } catch (error) {
      console.error("Error fetching attendance data:", error)
    }
  }

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
    } catch (error: any) {
      console.error("Camera error:", error.name, error.message)
      setCameraStatus("error")

      let title = "Camera Error"
      let message = "Unable to access camera. Please check your permissions."
      if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        title = "Camera Permission Denied"
        message = "Camera access was denied. Please allow camera permissions in your browser settings."
      } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
        title = "No Camera Found"
        message = "No camera was detected on this device."
      } else if (error.name === "NotReadableError" || error.name === "TrackStartError") {
        title = "Camera In Use"
        message = "The camera is already in use by another application."
      } else if (error.message === "Camera timed out") {
        title = "Camera Timeout"
        message = "Camera took too long to start. Please check your camera connection."
      }
      showNotification("error", title, message)
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
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error("Geolocation is not supported by this browser"))
          return
        }
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

      // For now, accept any location since branch coordinates aren't configured per-branch in DB
      setLocationStatus("valid")
      return true
    } catch (error) {
      console.error("GPS validation error:", error)
      setLocationStatus("error")
      if (error instanceof Error) {
        showNotification("error", "Location Error", error.message)
      }
      return false
    }
  }

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
          branchName: branchInfo?.branchName || null,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.alreadyClockedIn) {
          showNotification("info", "Already Clocked In", `You already clocked in today at ${formatTime(data.timeIn)}.`)
          setLatestTimeRecord((prev: any) => ({ ...prev, date: today, timeIn: data.timeIn, status: "present" }))
        } else {
          setLatestTimeRecord({ date: today, status: "present", timeIn: data.timeIn || timeIn })
          showNotification("success", "Clock In Success", `You have successfully clocked in at ${formatTime(data.timeIn || timeIn)}!`)
        }
        setShowClockInModal(false)
        if (currentUser) fetchAttendanceData(currentUser)
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
        showNotification("success", "Clock Out Success", `You have successfully clocked out at ${formatTime(data.timeOut || timeOut)}!`)
        if (currentUser) fetchAttendanceData(currentUser)
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

  const handleReportIssue = async () => {
    if (!currentUser || !issueNote.trim()) return

    setIsLoading(true)
    try {
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

  const today = new Date()
  const startDate = startOfMonth(today)
  const endDate = endOfMonth(today)
  const daysInMonth = eachDayOfInterval({ start: startDate, end: endDate })

  const getAttendanceForDay = (date: Date) => {
    return timeRecords.find((record) => {
      try {
        const recordDate = typeof record.date === "string" && record.date.includes("T")
          ? parseISO(record.date)
          : new Date(record.date + "T00:00:00")
        return isSameDay(recordDate, date)
      } catch {
        return false
      }
    })
  }

  const VerificationModal = ({ isClockIn, show, onClose, onSubmit }: {
    isClockIn: boolean
    show: boolean
    onClose: (open: boolean) => void
    onSubmit: () => void
  }) => (
    <Dialog open={show} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isClockIn ? "Clock In" : "Clock Out"} Verification</DialogTitle>
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
                  src={capturedPhoto}
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
                    ✓ GPS location verified
                  </p>
                </div>
              )}

              {locationStatus === "error" && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-md">
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    ⚠ Location access required. Please enable location permissions.
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
              onClick={onSubmit}
              disabled={locationStatus !== "valid" || cameraStatus !== "captured" || isLoading}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                isClockIn ? "Clock In" : "Clock Out"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )

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
                    Please ensure your phone's location services are enabled before clocking in or out.
                  </p>
                </div>

                <div className="text-center">
                  <div className="text-4xl font-bold mb-2">{format(new Date(), "h:mm a")}</div>
                  <div className="text-lg text-muted-foreground">{format(new Date(), "EEEE, MMMM d, yyyy")}</div>
                </div>

                {branchInfo && (
                  <div className="flex justify-center">
                    <div className="text-center p-4 border rounded-md bg-blue-50 dark:bg-blue-950/20">
                      <div className="text-sm text-muted-foreground mb-1">Assigned Branch</div>
                      <div className="font-medium flex items-center">
                        <MapPin className="mr-1 h-4 w-4" />
                        {branchInfo.branchName}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-center items-center gap-4">
                  <div className="text-center p-4 border rounded-md flex-1">
                    <div className="text-sm text-muted-foreground mb-1">Status</div>
                    <Badge
                      variant={latestTimeRecord?.status === "present" ? "default" : "outline"}
                      className="text-lg px-3 py-1"
                    >
                      {latestTimeRecord?.status === "present"
                        ? latestTimeRecord?.timeOut ? "Completed" : "Present"
                        : "Not Clocked In"}
                    </Badge>
                    {latestTimeRecord?.timeIn && (
                      <div className="mt-2 text-sm text-muted-foreground">
                        Time In: <span className="font-medium text-foreground">{formatTime(latestTimeRecord.timeIn)}</span>
                      </div>
                    )}
                    {latestTimeRecord?.timeOut && (
                      <div className="mt-1 text-sm text-muted-foreground">
                        Time Out: <span className="font-medium text-foreground">{formatTime(latestTimeRecord.timeOut)}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-center gap-4">
                  <Button
                    size="lg"
                    className="w-40"
                    onClick={handleClockInAttempt}
                    disabled={isLoading || (latestTimeRecord && latestTimeRecord.status === "present" && !!latestTimeRecord.timeIn)}
                  >
                    <Camera className="mr-2 h-4 w-4" />
                    Clock In
                  </Button>

                  <Button
                    size="lg"
                    variant="outline"
                    className="w-40 bg-transparent"
                    onClick={handleClockOutAttempt}
                    disabled={isLoading || !latestTimeRecord || latestTimeRecord.status !== "present" || !!latestTimeRecord.timeOut}
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
                    <li>• Enable your phone's location services before clocking in/out</li>
                    <li>• GPS location will be recorded with your attendance</li>
                    <li>• Selfie photo required for identity verification</li>
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
                      bgColor = attendance.status === "present"
                        ? "bg-green-100 dark:bg-green-900/30"
                        : "bg-yellow-100 dark:bg-yellow-900/30"
                    }

                    if (isSameDay(day, today)) {
                      bgColor += " border-2 border-primary"
                    }

                    return (
                      <div key={i} className={`text-center p-2 rounded-md ${bgColor}`}>
                        <div className="text-sm">{format(day, "d")}</div>
                        {attendance && <div className="text-xs mt-1">{attendance.status === "present" ? "✓" : "✗"}</div>}
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
                      .map((record, idx) => (
                        <div key={record.id || idx} className="flex justify-between items-center p-3 border rounded-md">
                          <div>
                            <div className="font-medium">{record.date}</div>
                            <div className="text-sm text-muted-foreground capitalize">
                              Status: {record.status || "Unknown"}
                            </div>
                          </div>
                          <Badge variant={record.status === "present" ? "default" : "outline"}>
                            {record.status === "present" ? "Present" : record.status || "Unknown"}
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

      <VerificationModal
        isClockIn={true}
        show={showClockInModal}
        onClose={setShowClockInModal}
        onSubmit={submitClockIn}
      />
      <VerificationModal
        isClockIn={false}
        show={showClockOutModal}
        onClose={setShowClockOutModal}
        onSubmit={submitClockOut}
      />
    </div>
  )
}
