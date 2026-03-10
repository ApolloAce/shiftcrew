"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useNotification } from "@/components/notification-provider"
import { format } from "date-fns"
import { Calendar, Clock, MapPin, AlertCircle, ShieldAlert, Navigation, Loader2, CheckCircle, XCircle } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { getCurrentPosition, checkSpoofIndicators, type GeoResult, type GeoError } from "@/lib/geolocation-helper"
import { toLocalDateISO } from "@/lib/utils"

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

  // On-leave status for current employee
  const [isOnLeave, setIsOnLeave] = useState(false)
  const [leaveEndDate, setLeaveEndDate] = useState<string | null>(null)

  // Location-based clock-in/out modal state
  const [showClockInModal, setShowClockInModal] = useState(false)
  const [showClockOutModal, setShowClockOutModal] = useState(false)

  // Time-based attendance rules: auto-hide clock-in after shift end, mark absent
  const [shiftExpired, setShiftExpired] = useState(false)
  const [locationStatus, setLocationStatus] = useState<"idle" | "checking" | "valid" | "rejected" | "error">("idle")
  const [locationMessage, setLocationMessage] = useState("")
  const [locationDistance, setLocationDistance] = useState<number | null>(null)
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
          const today = toLocalDateISO()

          const [branchRes, attendanceRes, leaveRes, approvedLeaveRes] = await Promise.all([
            userData.branchId
              ? fetch(`/api/branches?id=${userData.branchId}`).then((r) => r.ok ? r.json() : null)
              : Promise.resolve(null),
            fetch(`/api/attendance?employeeId=${userData.id}&date=${today}`).then((r) => r.ok ? r.json() : []),
            fetch(`/api/leave?employeeId=${userData.id}&status=pending`).then((r) => r.ok ? r.json() : []),
            fetch(`/api/leave?employeeId=${userData.id}&status=approved`).then((r) => r.ok ? r.json() : []),
          ])

          // Check if employee is currently on approved leave
          if (Array.isArray(approvedLeaveRes)) {
            const activeLeave = approvedLeaveRes.find((lv: any) => lv.startDate <= today && lv.endDate >= today)
            if (activeLeave) {
              setIsOnLeave(true)
              setLeaveEndDate(activeLeave.endDate)
            }
          }

          // Set initial branch from users table; schedule-based branch will override below
          setAssignedBranch(branchRes)
          setPendingLeaves(Array.isArray(leaveRes) ? leaveRes : [])

          // Find today's attendance record
          if (Array.isArray(attendanceRes) && attendanceRes.length > 0) {
            setLatestTimeRecord(attendanceRes[0])
          }

          // Fetch schedules for today using scheduleFor (exact match)
          try {
            const scheduleRes = await fetch(`/api/schedules?scheduleFor=${today}`)
            if (scheduleRes.ok) {
              const schedules = await scheduleRes.json()
              // Find this employee's schedule for today (use latest if multiple)
              if (Array.isArray(schedules) && schedules.length > 0) {
                const sorted = schedules.sort((a: any, b: any) => {
                  return new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()
                })
                for (const sched of sorted) {
                  if (sched.branchAssignments) {
                    let assignments = sched.branchAssignments
                    if (typeof assignments === "string") {
                      try { assignments = JSON.parse(assignments) } catch { assignments = null }
                    }
                    if (Array.isArray(assignments)) {
                      let found = false
                      for (const branch of assignments) {
                        const emp = branch.employees?.find(
                          (e: any) => String(e.employeeId) === String(userData.id)
                        )
                        if (emp) {
                          const shiftObj = typeof emp.shift === "object" && emp.shift ? emp.shift : null
                          // Map shift string to actual times
                          const shiftTimes = typeof emp.shift === "string" ? (() => {
                            switch (emp.shift.toUpperCase()) {
                              case "AM": return { start: "07:00", end: "22:00" }
                              case "PM": return { start: "14:00", end: "22:00" }
                              default: return { start: "", end: "" }
                            }
                          })() : null
                          setTodaySchedule({
                            date: sched.scheduleFor || sched.date,
                            startTime: shiftObj?.start || emp.shiftStart || shiftTimes?.start || sched.time || "",
                            endTime: shiftObj?.end || emp.shiftEnd || shiftTimes?.end || "",
                            branchName: branch.branchName || "Unknown",
                            notes: sched.notes || "",
                          })
                          // Always use today's schedule branch as the assigned branch (rotation-aware)
                          if (branch.branchId) {
                            try {
                              const brRes = await fetch(`/api/branches?id=${branch.branchId}`)
                              if (brRes.ok) {
                                const brData = await brRes.json()
                                if (brData) setAssignedBranch(brData)
                              }
                            } catch {}
                          }
                          found = true
                          break
                        }
                      }
                      if (found) break
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

  // --- Shift time enforcement: check if current time is past shift end ---
  useEffect(() => {
    const checkShiftExpiry = () => {
      if (!todaySchedule) { setShiftExpired(false); return }
      const endTime = todaySchedule.endTime
      if (!endTime) { setShiftExpired(false); return }
      const [h, m] = endTime.split(":").map(Number)
      const now = new Date()
      const endMinutes = h * 60 + m
      const nowMinutes = now.getHours() * 60 + now.getMinutes()
      // If current time is past shift end + 1 minute, shift is expired
      setShiftExpired(nowMinutes > endMinutes)
    }
    checkShiftExpiry()
    const interval = setInterval(checkShiftExpiry, 30000) // re-check every 30s
    return () => clearInterval(interval)
  }, [todaySchedule])

  // --- Modal openers ---
  const handleClockInAttempt = () => {
    setShowClockInModal(true)
    setLocationStatus("idle")
    setLocationMessage("")
    setLocationDistance(null)
    setCurrentLocation(null)
  }

  const handleClockOutAttempt = () => {
    setShowClockOutModal(true)
    setLocationStatus("idle")
    setLocationMessage("")
    setLocationDistance(null)
    setCurrentLocation(null)
  }

  // --- Location validation (replaces photo + GPS flow) ---
  const validateLocation = async (): Promise<boolean> => {
    if (!currentUser) return false
    setLocationStatus("checking")
    setLocationMessage("Processing...")

    try {
      // 1. Get GPS position
      const geoResult = await getCurrentPosition()
      setCurrentLocation({
        latitude: geoResult.latitude,
        longitude: geoResult.longitude,
        accuracy: geoResult.accuracy,
      })

      // Check for spoof indicators
      const warnings = checkSpoofIndicators(geoResult)
      if (warnings.length > 0) {
        console.warn("[Attendance] Spoof indicators:", warnings)
      }

      setLocationMessage("Verifying attendance...")

      // 2. Validate against branch radius via API
      const res = await fetch("/api/attendance/validate-location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: currentUser.id,
          latitude: geoResult.latitude,
          longitude: geoResult.longitude,
          accuracy: geoResult.accuracy,
        }),
      })

      const data = await res.json()
      setLocationDistance(data.distanceMeters ?? null)

      if (data.valid) {
        setLocationStatus("valid")
        setLocationMessage("Attendance verified successfully!")
        return true
      } else {
        setLocationStatus("rejected")
        setLocationMessage("You are not within the allowed attendance zone. Please move closer to your assigned branch.")
        return false
      }
    } catch (error: any) {
      console.error("Location validation error:", error)
      setLocationStatus("error")
      setLocationMessage("Unable to verify attendance. Please ensure location services are enabled and try again.")
      return false
    }
  }

  // --- Submit clock-in (location-based, no photo) ---
  const submitClockIn = async () => {
    if (!currentUser) return
    setIsLoading(true)
    try {
      const isValid = await validateLocation()
      if (!isValid) {
        setIsLoading(false)
        return
      }

      const now = new Date()
      const today = toLocalDateISO(now)
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
          latitude: currentLocation?.latitude || null,
          longitude: currentLocation?.longitude || null,
          branchId: currentUser.branchId || null,
          branchName: assignedBranch?.branchName || null,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.alreadyClockedIn) {
          showNotification("info", "Already Clocked In", `You already clocked in today at ${formatTime(data.timeIn)}.`)
          setLatestTimeRecord((prev: any) => ({ ...prev, date: today, timeIn: data.timeIn, status: "present" }))
        } else {
          setLatestTimeRecord({ date: today, timeIn: data.timeIn || timeIn, status: "present" })
          showNotification("success", "Clocked In", `You have successfully clocked in at ${formatTime(data.timeIn || timeIn)}.`)
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

  // --- Submit clock-out (location-based, no photo) ---
  const submitClockOut = async () => {
    if (!currentUser) return
    setIsLoading(true)
    try {
      const isValid = await validateLocation()
      if (!isValid) {
        setIsLoading(false)
        return
      }

      const now = new Date()
      const today = toLocalDateISO(now)
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
                <Badge
                  variant={isOnLeave ? "default" : (latestTimeRecord && latestTimeRecord.status === "present" ? "default" : "outline")}
                  className={isOnLeave ? "bg-orange-500 hover:bg-orange-600 text-white" : ""}
                >
                  {isOnLeave ? "On Leave" : (latestTimeRecord && latestTimeRecord.status === "present" ? "Present" : "Not Clocked In")}
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
                {isOnLeave ? (
                  <div className="text-center space-y-2">
                    <Badge className="bg-orange-500 hover:bg-orange-600 text-white text-sm px-3 py-1">ON LEAVE</Badge>
                    <p className="text-xs text-muted-foreground">You are on approved leave until {leaveEndDate}</p>
                  </div>
                ) : !todaySchedule && !assignedBranch ? (
                  <div className="text-center text-sm text-muted-foreground">
                    No schedule assigned — clock-in unavailable
                  </div>
                ) : shiftExpired && (!latestTimeRecord || latestTimeRecord.status !== "present") ? (
                  <div className="text-center space-y-2">
                    <Badge variant="destructive">Absent</Badge>
                    <p className="text-xs text-muted-foreground">Shift has ended — clock-in is no longer available</p>
                  </div>
                ) : !latestTimeRecord || latestTimeRecord.status !== "present" ? (
                  <Button className="w-full" onClick={handleClockInAttempt} disabled={isLoading}>
                    <Navigation className="mr-2 h-4 w-4" />
                    Clock In
                  </Button>
                ) : !latestTimeRecord.timeOut ? (
                  <Button className="w-full" variant="outline" onClick={handleClockOutAttempt} disabled={isLoading}>
                    <Navigation className="mr-2 h-4 w-4" />
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

      {/* Clock-In Location Modal */}
      <Dialog open={showClockInModal} onOpenChange={setShowClockInModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clock In</DialogTitle>
            <DialogDescription>Confirm your attendance to start your shift</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {locationStatus === "idle" && (
              <div className="text-center space-y-4 py-4">
                <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Navigation className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Press the button below to clock in and start your shift.
                  </p>
                </div>
                <Button onClick={submitClockIn} disabled={isLoading} className="w-full">
                  {isLoading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</>) : (<><Navigation className="mr-2 h-4 w-4" />Clock In</>)}
                </Button>
              </div>
            )}

            {locationStatus === "checking" && (
              <div className="text-center space-y-3 py-4">
                <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
                <p className="text-sm text-muted-foreground">{locationMessage}</p>
              </div>
            )}

            {locationStatus === "valid" && (
              <div className="space-y-3 py-2">
                <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg text-center">
                  <CheckCircle className="h-10 w-10 text-green-600 mx-auto mb-2" />
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">{locationMessage}</p>
                </div>
              </div>
            )}

            {locationStatus === "rejected" && (
              <div className="space-y-3 py-2">
                <div className="p-4 bg-red-50 dark:bg-red-950/20 rounded-lg text-center">
                  <XCircle className="h-10 w-10 text-red-600 mx-auto mb-2" />
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">{locationMessage}</p>
                </div>
                <Button variant="outline" onClick={submitClockIn} disabled={isLoading} className="w-full">
                  {isLoading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Retrying...</>) : "Retry"}
                </Button>
              </div>
            )}

            {locationStatus === "error" && (
              <div className="space-y-3 py-2">
                <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg text-center">
                  <AlertCircle className="h-10 w-10 text-amber-600 mx-auto mb-2" />
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">{locationMessage}</p>
                </div>
                <Button variant="outline" onClick={submitClockIn} disabled={isLoading} className="w-full">
                  {isLoading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Retrying...</>) : "Retry"}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Clock-Out Location Modal */}
      <Dialog open={showClockOutModal} onOpenChange={setShowClockOutModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clock Out</DialogTitle>
            <DialogDescription>Confirm your attendance to end your shift</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {locationStatus === "idle" && (
              <div className="text-center space-y-4 py-4">
                <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Navigation className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Press the button below to clock out and end your shift.
                  </p>
                </div>
                <Button onClick={submitClockOut} disabled={isLoading} variant="outline" className="w-full">
                  {isLoading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</>) : (<><Navigation className="mr-2 h-4 w-4" />Clock Out</>)}
                </Button>
              </div>
            )}

            {locationStatus === "checking" && (
              <div className="text-center space-y-3 py-4">
                <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
                <p className="text-sm text-muted-foreground">{locationMessage}</p>
              </div>
            )}

            {locationStatus === "valid" && (
              <div className="space-y-3 py-2">
                <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg text-center">
                  <CheckCircle className="h-10 w-10 text-green-600 mx-auto mb-2" />
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">{locationMessage}</p>
                </div>
              </div>
            )}

            {locationStatus === "rejected" && (
              <div className="space-y-3 py-2">
                <div className="p-4 bg-red-50 dark:bg-red-950/20 rounded-lg text-center">
                  <XCircle className="h-10 w-10 text-red-600 mx-auto mb-2" />
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">{locationMessage}</p>
                </div>
                <Button variant="outline" onClick={submitClockOut} disabled={isLoading} className="w-full">
                  {isLoading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Retrying...</>) : "Retry"}
                </Button>
              </div>
            )}

            {locationStatus === "error" && (
              <div className="space-y-3 py-2">
                <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg text-center">
                  <AlertCircle className="h-10 w-10 text-amber-600 mx-auto mb-2" />
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">{locationMessage}</p>
                </div>
                <Button variant="outline" onClick={submitClockOut} disabled={isLoading} className="w-full">
                  {isLoading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Retrying...</>) : "Retry"}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
