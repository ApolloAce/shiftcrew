"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useNotification } from "@/components/notification-provider"
import { format } from "date-fns"
import { Calendar, Clock, MapPin, AlertCircle, ShieldAlert } from "lucide-react"

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

  const handleClockIn = async () => {
    if (!currentUser) return

    setIsLoading(true)
    try {
      // Step 1: Capture photo for attendance verification
      let photoDataUrl: string | null = null
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        })
        const video = document.createElement("video")
        video.srcObject = stream
        video.play()
        await new Promise((resolve) => { video.onloadedmetadata = resolve })
        // Small delay to let camera warm up
        await new Promise((resolve) => setTimeout(resolve, 500))
        const canvas = document.createElement("canvas")
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext("2d")
        ctx?.drawImage(video, 0, 0)
        photoDataUrl = canvas.toDataURL("image/jpeg", 0.8)
        stream.getTracks().forEach((track) => track.stop())
      } catch (cameraError) {
        showNotification("error", "Camera Required", "Photo-based attendance is required. Please allow camera access to clock in.")
        setIsLoading(false)
        return
      }

      if (!photoDataUrl) {
        showNotification("error", "Photo Required", "Could not capture photo. Please try again.")
        setIsLoading(false)
        return
      }

      // Step 2: Get GPS location
      let location: { latitude: number; longitude: number; accuracy: number } | null = null
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000,
          })
        })
        location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }
      } catch (geoError) {
        showNotification("error", "Location Required", "GPS location is required for attendance. Please enable location services.")
        setIsLoading(false)
        return
      }

      // Step 3: Submit attendance with photo and location verification
      const now = new Date()
      const today = now.toISOString().split("T")[0]
      const timeIn = now.toTimeString().slice(0, 8)

      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: currentUser.id,
          employeeName: `${currentUser.firstName} ${currentUser.surname}`,
          date: today,
          status: "present",
          branchId: currentUser.branchId || null,
        }),
      })

      if (res.ok) {
        setLatestTimeRecord({ date: today, timeIn, status: "present" })
        showNotification("success", "Clocked In", `You have successfully clocked in at ${formatTime(timeIn)} (photo verified)`)
      } else {
        showNotification("error", "Error", "Failed to clock in. Please try again.")
      }
    } catch (error) {
      console.error("Error clocking in:", error)
      showNotification("error", "Error", "Failed to clock in. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleClockOut = async () => {
    if (!currentUser) return

    setIsLoading(true)
    try {
      const now = new Date()
      const today = now.toISOString().split("T")[0]
      const timeOut = now.toTimeString().slice(0, 8)

      // Update the attendance record
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: currentUser.id,
          employeeName: `${currentUser.firstName} ${currentUser.surname}`,
          date: today,
          status: "present",
        }),
      })

      if (res.ok) {
        setLatestTimeRecord((prev: any) => ({
          ...prev,
          timeOut,
        }))
        showNotification("success", "Clocked Out", `You have successfully clocked out at ${formatTime(timeOut)}`)
      } else {
        showNotification("error", "Error", "Failed to clock out. Please try again.")
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
                  <Button className="w-full" onClick={handleClockIn} disabled={isLoading}>
                    Clock In
                  </Button>
                ) : (
                  <Button className="w-full" variant="outline" onClick={handleClockOut} disabled={isLoading}>
                    Clock Out
                  </Button>
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
    </div>
  )
}
