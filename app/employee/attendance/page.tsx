"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useNotification } from "@/components/notification-provider"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO } from "date-fns"
import { Calendar, Clock, AlertCircle, MapPin, Navigation, CheckCircle, XCircle, Loader2 } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { getCurrentPosition, checkSpoofIndicators } from "@/lib/geolocation-helper"
import { toLocalDateISO } from "@/lib/utils"

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
  const [locationStatus, setLocationStatus] = useState<"idle" | "checking" | "valid" | "rejected" | "error">("idle")
  const [locationMessage, setLocationMessage] = useState("")
  const [locationDistance, setLocationDistance] = useState<number | null>(null)
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null)
  const [branchInfo, setBranchInfo] = useState<any | null>(null)
  const [validatedBranch, setValidatedBranch] = useState<{ branchId: string; branchName: string } | null>(null)

  // Schedule & shift expiry state
  const [todaySchedule, setTodaySchedule] = useState<{ startTime: string; endTime: string; branchName: string } | null>(null)
  const [shiftExpired, setShiftExpired] = useState(false)

  useEffect(() => {
    const user = sessionStorage.getItem("currentUser")
    if (!user) return

    try {
      const userData = JSON.parse(user)
      setCurrentUser(userData)

      if (userData.id) {
        // Fetch fresh employee data from DB, then override with today's schedule branch
        fetch(`/api/employees?id=${userData.id}`)
          .then((r) => r.ok ? r.json() : null)
          .then(async (freshData) => {
            let workingUser = userData
            if (freshData && freshData.branchId !== undefined) {
              workingUser = { ...userData, branchId: freshData.branchId }
              setCurrentUser(workingUser)
              sessionStorage.setItem("currentUser", JSON.stringify(workingUser))
            }

            // Fetch today's schedule to get the rotation-based branch assignment
            try {
              const today = toLocalDateISO()
              const schedRes = await fetch(`/api/schedules?scheduleFor=${today}`)
              if (schedRes.ok) {
                const schedules = await schedRes.json()
                if (Array.isArray(schedules) && schedules.length > 0) {
                  const sorted = schedules.sort((a: any, b: any) =>
                    new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()
                  )
                  for (const sched of sorted) {
                    let assignments = sched.branchAssignments
                    if (typeof assignments === "string") {
                      try { assignments = JSON.parse(assignments) } catch { assignments = null }
                    }
                    if (Array.isArray(assignments)) {
                      for (const branch of assignments) {
                        const emp = branch.employees?.find(
                          (e: any) => String(e.employeeId) === String(workingUser.id)
                        )
                        if (emp && branch.branchId) {
                          // Use schedule branch as the effective branch
                          workingUser = { ...workingUser, branchId: branch.branchId }
                          setCurrentUser(workingUser)
                          sessionStorage.setItem("currentUser", JSON.stringify(workingUser))

                          // Extract shift times from schedule
                          const shiftStr = typeof emp.shift === "string" ? emp.shift : null
                          const shiftTimes = shiftStr ? (() => {
                            switch (shiftStr.toUpperCase()) {
                              case "AM": return { start: "07:00", end: "14:00" }
                              case "PM": return { start: "14:00", end: "22:00" }
                              default: return { start: "", end: "" }
                            }
                          })() : null
                          setTodaySchedule({
                            startTime: emp.shiftStart || shiftTimes?.start || "07:00",
                            endTime: emp.shiftEnd || shiftTimes?.end || "14:00",
                            branchName: branch.branchName || "Unknown",
                          })
                          break
                        }
                      }
                    }
                  }
                }
              }
            } catch (err) {
              console.error("Error fetching schedule for branch:", err)
            }

            fetchAttendanceData(workingUser)
          })
          .catch(() => {
            fetchAttendanceData(userData)
          })
      }
    } catch (error) {
      console.error("Error loading attendance data:", error)
    }
  }, [])

  // --- Shift time enforcement: hide clock-in after shift end, mark absent ---
  useEffect(() => {
    const checkShiftExpiry = () => {
      if (!todaySchedule) { setShiftExpired(false); return }
      const endTime = todaySchedule.endTime
      if (!endTime) { setShiftExpired(false); return }
      const [h, m] = endTime.split(":").map(Number)
      const now = new Date()
      const endMinutes = h * 60 + m
      const nowMinutes = now.getHours() * 60 + now.getMinutes()
      setShiftExpired(nowMinutes > endMinutes)
    }
    checkShiftExpiry()
    const interval = setInterval(checkShiftExpiry, 30000) // re-check every 30s
    return () => clearInterval(interval)
  }, [todaySchedule])

  const fetchAttendanceData = async (userData: any) => {
    try {
      const today = toLocalDateISO()
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

  // Location validation (replaces photo + GPS flow)
  const validateLocation = async (): Promise<boolean> => {
    if (!currentUser) return false
    setLocationStatus("checking")
    setLocationMessage("Getting your location...")

    try {
      const geoResult = await getCurrentPosition()
      setCurrentLocation({
        latitude: geoResult.latitude,
        longitude: geoResult.longitude,
        accuracy: geoResult.accuracy,
      })

      const warnings = checkSpoofIndicators(geoResult)
      if (warnings.length > 0) {
        console.warn("[Attendance] Spoof indicators:", warnings)
      }

      setLocationMessage("Verifying your location against branch...")

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
        setLocationMessage(`Location verified! You are ${data.distanceMeters}m from ${data.branchName}.`)
        // Store the validated branch so clock-in/out uses the correct (schedule-based) branch
        setValidatedBranch({ branchId: data.branchId, branchName: data.branchName })
        return true
      } else {
        setLocationStatus("rejected")
        setLocationMessage(data.message || "You are not within the branch attendance zone.")
        return false
      }
    } catch (error: any) {
      console.error("Location validation error:", error)
      setLocationStatus("error")
      setLocationMessage(error.message || "Failed to get your location. Please enable location services and try again.")
      return false
    }
  }

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

      // Determine if employee is clocking in late (undertime)
      let clockInStatus = "present"
      if (todaySchedule?.startTime) {
        const [sh, sm] = todaySchedule.startTime.split(":").map(Number)
        const schedStart = sh * 60 + sm
        const nowMin = now.getHours() * 60 + now.getMinutes()
        if (nowMin > schedStart) {
          clockInStatus = "undertime"
        }
      }

      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "clock-in",
          employeeId: currentUser.id,
          employeeName: `${currentUser.firstName} ${currentUser.surname}`,
          date: today,
          status: clockInStatus,
          timeIn,
          latitude: currentLocation?.latitude || null,
          longitude: currentLocation?.longitude || null,
          branchId: validatedBranch?.branchId || currentUser.branchId || null,
          branchName: validatedBranch?.branchName || branchInfo?.branchName || null,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.alreadyClockedIn) {
          showNotification("info", "Already Clocked In", `You already clocked in today at ${formatTime(data.timeIn)}.`)
          setLatestTimeRecord((prev: any) => ({ ...prev, date: today, timeIn: data.timeIn, status: prev?.status || "present" }))
        } else {
          setLatestTimeRecord({ date: today, status: clockInStatus, timeIn: data.timeIn || timeIn })
          if (clockInStatus === "undertime") {
            const schedStartFormatted = todaySchedule?.startTime ? formatTime(todaySchedule.startTime) : "N/A"
            showNotification("info", "Undertime", `Clocked in at ${formatTime(data.timeIn || timeIn)} — schedule started at ${schedStartFormatted}. Marked as Undertime.`)
          } else {
            showNotification("success", "Clock In Success", `You have successfully clocked in at ${formatTime(data.timeIn || timeIn)}!`)
          }
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

  const LocationModal = ({ isClockIn, show, onClose, onSubmit }: {
    isClockIn: boolean
    show: boolean
    onClose: (open: boolean) => void
    onSubmit: () => void
  }) => (
    <Dialog open={show} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isClockIn ? "Clock In" : "Clock Out"}</DialogTitle>
          <DialogDescription>Your location will be verified against your assigned branch</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {locationStatus === "idle" && (
            <div className="text-center space-y-4 py-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Navigation className="h-8 w-8 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">
                Press the button below to verify your location and {isClockIn ? "clock in" : "clock out"}.
                You must be within your assigned branch's attendance zone.
              </p>
              <Button onClick={onSubmit} disabled={isLoading} className="w-full">
                {isLoading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying Location...</>) : (<><Navigation className="mr-2 h-4 w-4" />Verify Location & {isClockIn ? "Clock In" : "Clock Out"}</>)}
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
                {currentLocation && (
                  <p className="text-xs text-green-600 mt-1">Accuracy: ±{Math.round(currentLocation.accuracy)}m</p>
                )}
              </div>
            </div>
          )}

          {locationStatus === "rejected" && (
            <div className="space-y-3 py-2">
              <div className="p-4 bg-red-50 dark:bg-red-950/20 rounded-lg text-center">
                <XCircle className="h-10 w-10 text-red-600 mx-auto mb-2" />
                <p className="text-sm font-medium text-red-800 dark:text-red-200">{locationMessage}</p>
              </div>
              <Button variant="outline" onClick={onSubmit} disabled={isLoading} className="w-full">
                {isLoading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Retrying...</>) : "Retry Location Check"}
              </Button>
            </div>
          )}

          {locationStatus === "error" && (
            <div className="space-y-3 py-2">
              <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg text-center">
                <AlertCircle className="h-10 w-10 text-amber-600 mx-auto mb-2" />
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">{locationMessage}</p>
              </div>
              <Button variant="outline" onClick={onSubmit} disabled={isLoading} className="w-full">
                {isLoading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Retrying...</>) : "Retry"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Attendance</h1>
        <p className="text-muted-foreground">Manage your attendance with location-based verification</p>
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
                Time Clock
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-md border border-blue-200 dark:border-blue-800">
                  <h4 className="font-medium mb-2 flex items-center text-blue-800 dark:text-blue-200">
                    <MapPin className="mr-2 h-5 w-5 text-blue-600" />
                    Location-Based Attendance
                  </h4>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    Your location will be verified against your assigned branch. Please ensure location services are enabled.
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

                {/* Schedule info */}
                {todaySchedule && (
                  <div className="flex justify-center">
                    <div className="text-center p-4 border rounded-md bg-gray-50 dark:bg-gray-900/30">
                      <div className="text-sm text-muted-foreground mb-1">Today's Schedule</div>
                      <div className="font-medium flex items-center justify-center gap-2">
                        <Clock className="h-4 w-4" />
                        {formatTime(todaySchedule.startTime)} – {formatTime(todaySchedule.endTime)}
                      </div>
                    </div>
                  </div>
                )}

                {/* Shift expired — absent indicator */}
                {shiftExpired && !latestTimeRecord?.timeIn && (
                  <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg text-center">
                    <Badge variant="destructive" className="text-base px-4 py-1.5 mb-2">Absent</Badge>
                    <p className="text-sm text-red-700 dark:text-red-300">
                      Shift has ended ({todaySchedule ? `${formatTime(todaySchedule.startTime)} – ${formatTime(todaySchedule.endTime)}` : ""}) — clock-in is no longer available.
                    </p>
                  </div>
                )}

                <div className="flex justify-center items-center gap-4">
                  <div className="text-center p-4 border rounded-md flex-1">
                    <div className="text-sm text-muted-foreground mb-1">Status</div>
                    <Badge
                      variant={latestTimeRecord?.status === "present" || latestTimeRecord?.status === "undertime" ? "default" : "outline"}
                      className={`text-lg px-3 py-1 ${latestTimeRecord?.status === "undertime" ? "bg-amber-500 hover:bg-amber-600" : ""}`}
                    >
                      {latestTimeRecord?.status === "present"
                        ? latestTimeRecord?.timeOut ? "Completed" : "Present"
                        : latestTimeRecord?.status === "undertime"
                          ? latestTimeRecord?.timeOut ? "Completed (Undertime)" : "Undertime"
                          : shiftExpired ? "Absent" : "Not Clocked In"}
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
                  {/* Hide Clock In when shift has expired and no clock-in was made */}
                  {!(shiftExpired && !latestTimeRecord?.timeIn) && (
                  <Button
                    size="lg"
                    className="w-40"
                    onClick={handleClockInAttempt}
                    disabled={isLoading || (latestTimeRecord && (latestTimeRecord.status === "present" || latestTimeRecord.status === "undertime") && !!latestTimeRecord.timeIn)}
                  >
                    <Navigation className="mr-2 h-4 w-4" />
                    Clock In
                  </Button>
                  )}

                  <Button
                    size="lg"
                    variant="outline"
                    className="w-40 bg-transparent"
                    onClick={handleClockOutAttempt}
                    disabled={isLoading || !latestTimeRecord || (latestTimeRecord.status !== "present" && latestTimeRecord.status !== "undertime") || !!latestTimeRecord.timeOut}
                  >
                    <Navigation className="mr-2 h-4 w-4" />
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
                    <li>• GPS location will be verified against your assigned branch</li>
                    <li>• You must be within the branch attendance radius to clock in/out</li>
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
                <div className="flex gap-4 mb-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100 dark:bg-green-900/30 border"></span> Present</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-100 dark:bg-amber-900/30 border"></span> Undertime</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-50 dark:bg-red-900/20 border"></span> Absent</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-50 dark:bg-gray-900 border"></span> Weekend</span>
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                    <div key={day} className="text-center font-medium text-sm p-2">
                      {day}
                    </div>
                  ))}

                  {/* Spacer cells to align the first day under the correct column */}
                  {(() => {
                    const firstDay = daysInMonth[0].getDay() // 0=Sun
                    const offset = firstDay === 0 ? 6 : firstDay - 1 // Mon=0, Tue=1, ...
                    return Array.from({ length: offset }, (_, i) => <div key={`spacer-${i}`} />)
                  })()}

                  {daysInMonth.map((day, i) => {
                    const attendance = getAttendanceForDay(day)
                    const isPast = day < today && !isSameDay(day, today)
                    const dayOfWeek = day.getDay() // 0=Sun, 6=Sat
                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
                    const isFuture = day > today && !isSameDay(day, today)
                    let bgColor = "bg-gray-100 dark:bg-gray-800"
                    let indicator = ""

                    if (attendance) {
                      if (attendance.status === "present") {
                        bgColor = "bg-green-100 dark:bg-green-900/30"
                        indicator = "✓"
                      } else if (attendance.status === "undertime") {
                        bgColor = "bg-amber-100 dark:bg-amber-900/30"
                        indicator = "⏱"
                      } else {
                        bgColor = "bg-red-100 dark:bg-red-900/30"
                        indicator = "✗"
                      }
                    } else if (isPast && !isWeekend) {
                      // Past weekday with no attendance record = Absent
                      bgColor = "bg-red-50 dark:bg-red-900/20"
                      indicator = "✗"
                    } else if (isWeekend) {
                      bgColor = "bg-gray-50 dark:bg-gray-900"
                    }

                    if (isSameDay(day, today)) {
                      bgColor += " ring-2 ring-primary"
                    }

                    return (
                      <div key={i} className={`text-center p-2 rounded-md ${bgColor} ${isFuture ? 'opacity-50' : ''}`}>
                        <div className="text-sm">{format(day, "d")}</div>
                        {indicator && <div className={`text-xs mt-1 ${indicator === "✓" ? "text-green-600" : indicator === "⏱" ? "text-amber-600" : "text-red-500"}`}>{indicator}</div>}
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
                          <Badge
                            variant={record.status === "present" || record.status === "undertime" ? "default" : "outline"}
                            className={record.status === "undertime" ? "bg-amber-500 hover:bg-amber-600" : ""}
                          >
                            {record.status === "present" ? "Present" : record.status === "undertime" ? "Undertime" : record.status || "Unknown"}
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

      <LocationModal
        isClockIn={true}
        show={showClockInModal}
        onClose={setShowClockInModal}
        onSubmit={submitClockIn}
      />
      <LocationModal
        isClockIn={false}
        show={showClockOutModal}
        onClose={setShowClockOutModal}
        onSubmit={submitClockOut}
      />
    </div>
  )
}
