"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { format, startOfWeek, endOfWeek, eachDayOfInterval, subWeeks, addWeeks } from "date-fns"
import { ChevronLeft, ChevronRight, CheckCircle, XCircle, Clock, Palmtree } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface EmployeeShift {
  date: string
  startTime: string
  endTime: string
  branchName: string
  branchId: string
  notes?: string
}

interface AttendanceRecord {
  date: string
  status: string
  timeIn?: string
  timeOut?: string
  branchName?: string
}

// Map shift type string to actual start/end times
function getShiftTimes(shift: string): { start: string; end: string } {
  switch (shift?.toUpperCase()) {
    case "AM": return { start: "07:00", end: "22:00" }
    case "PM": return { start: "14:00", end: "22:00" }
    default: return { start: "", end: "" }
  }
}

export default function EmployeeSchedulePage() {
  const [currentUser, setCurrentUser] = useState<{ id: number | string } | null>(null)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [weekSchedules, setWeekSchedules] = useState<EmployeeShift[]>([])
  const [weekAttendance, setWeekAttendance] = useState<AttendanceRecord[]>([])
  const [approvedLeaves, setApprovedLeaves] = useState<{ startDate: string; endDate: string }[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Memoize date calculations
  const { startOfCurrentWeek, endOfCurrentWeek, weekDays } = useMemo(() => {
    const startOfWeekDate = startOfWeek(currentDate, { weekStartsOn: 1 })
    const endOfWeekDate = endOfWeek(currentDate, { weekStartsOn: 1 })

    const days = eachDayOfInterval({
      start: startOfWeekDate,
      end: endOfWeekDate,
    })

    return {
      startOfCurrentWeek: startOfWeekDate,
      endOfCurrentWeek: endOfWeekDate,
      weekDays: days,
    }
  }, [currentDate])

  // Load current user
  useEffect(() => {
    const user = sessionStorage.getItem("currentUser")
    if (!user) return
    try {
      const userData = JSON.parse(user)
      setCurrentUser(userData)
    } catch (error) {
      console.error("Error loading user data:", error)
      setError("Failed to load user data. Please try logging in again.")
    }
  }, [])

  // Compute week start/end as strings for stable dependency comparison
  const weekStartStr = useMemo(() => format(startOfCurrentWeek, "yyyy-MM-dd"), [startOfCurrentWeek])
  const weekEndStr = useMemo(() => format(endOfCurrentWeek, "yyyy-MM-dd"), [endOfCurrentWeek])

  // Fetch schedules AND attendance for the current week
  useEffect(() => {
    if (!currentUser?.id) return

    // Clear old data immediately so stale data don't show
    setWeekSchedules([])
    setWeekAttendance([])
    setApprovedLeaves([])
    setIsLoading(true)
    setError(null)

    const fetchData = async () => {
      try {
        // Fetch schedules, attendance, and leaves in parallel
        const [schedRes, attRes, leaveRes] = await Promise.all([
          fetch(`/api/schedules?weekStart=${weekStartStr}`),
          fetch(`/api/attendance?employeeId=${currentUser.id}&startDate=${weekStartStr}&endDate=${weekEndStr}`),
          fetch(`/api/leave?employeeId=${currentUser.id}&status=approved`),
        ])

        // --- Parse schedules ---
        const employeeShifts: EmployeeShift[] = []
        if (schedRes.ok) {
          const schedules = await schedRes.json()
          if (Array.isArray(schedules)) {
            // Deduplicate by scheduleFor date — keep only the latest schedule per day
            const byDate: Record<string, any> = {}
            for (const sched of schedules) {
              const targetDate = sched.scheduleFor || sched.date
              const existing = byDate[targetDate]
              if (!existing || new Date(sched.updatedAt || sched.createdAt || 0) > new Date(existing.updatedAt || existing.createdAt || 0)) {
                byDate[targetDate] = sched
              }
            }

            for (const sched of Object.values(byDate)) {
              let assignments = sched.branchAssignments
              if (typeof assignments === "string") {
                try { assignments = JSON.parse(assignments) } catch { assignments = null }
              }

              if (Array.isArray(assignments)) {
                for (const branch of assignments) {
                  const found = branch.employees?.find(
                    (e: any) => String(e.employeeId) === String(currentUser.id)
                  )
                  if (found) {
                    const shiftObj = typeof found.shift === "object" && found.shift ? found.shift : null
                    const shiftTimes = typeof found.shift === "string" ? getShiftTimes(found.shift) : null
                    employeeShifts.push({
                      date: sched.scheduleFor || sched.date,
                      startTime: shiftObj?.start || found.shiftStart || shiftTimes?.start || sched.time || "",
                      endTime: shiftObj?.end || found.shiftEnd || shiftTimes?.end || "",
                      branchName: branch.branchName || "Unknown Branch",
                      branchId: branch.branchId || "",
                      notes: sched.notes,
                    })
                  }
                }
              }
            }
          }
        }

        // --- Parse attendance ---
        const attendanceRecords: AttendanceRecord[] = []
        if (attRes.ok) {
          const records = await attRes.json()
          if (Array.isArray(records)) {
            for (const r of records) {
              attendanceRecords.push({
                date: typeof r.date === "string" && r.date.includes("T") ? r.date.split("T")[0] : r.date,
                status: r.status || "unknown",
                timeIn: r.timeIn || undefined,
                timeOut: r.timeOut || undefined,
                branchName: r.branchName || undefined,
              })
            }
          }
        }

        setWeekSchedules(employeeShifts)
        setWeekAttendance(attendanceRecords)

        // --- Parse leaves ---
        if (leaveRes.ok) {
          const leaves = await leaveRes.json()
          if (Array.isArray(leaves)) {
            setApprovedLeaves(leaves.map((lv: any) => ({ startDate: lv.startDate, endDate: lv.endDate })))
          }
        }
      } catch (error) {
        console.error("Error loading schedule data:", error)
        setError("Failed to load schedule data. Please try again.")
        setWeekSchedules([])
        setWeekAttendance([])
        setApprovedLeaves([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [currentUser, weekStartStr, weekEndStr])

  const handlePreviousWeek = () => {
    setCurrentDate(subWeeks(currentDate, 1))
  }

  const handleNextWeek = () => {
    setCurrentDate(addWeeks(currentDate, 1))
  }

  const handleToday = () => {
    setCurrentDate(new Date())
  }

  const formatTime = (timeString: string) => {
    if (!timeString) return "N/A"
    try {
      const [hours, minutes] = timeString.split(":")
      const hour = Number.parseInt(hours, 10)
      const period = hour >= 12 ? "PM" : "AM"
      const formattedHour = hour % 12 || 12
      return `${formattedHour}:${minutes} ${period}`
    } catch {
      return "N/A"
    }
  }

  const getScheduleForDay = (date: Date) => {
    const dateString = format(date, "yyyy-MM-dd")
    return weekSchedules.find((s) => s.date === dateString)
  }

  const getAttendanceForDay = (date: Date) => {
    const dateString = format(date, "yyyy-MM-dd")
    return weekAttendance.find((a) => a.date === dateString)
  }

  const isToday = (date: Date) => {
    const today = new Date()
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    )
  }

  const isPast = (date: Date) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    return d < today
  }

  const isWeekend = (date: Date) => {
    const dow = date.getDay()
    return dow === 0 || dow === 6
  }

  const isDayOnLeave = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd")
    return approvedLeaves.some((lv) => dateStr >= lv.startDate && dateStr <= lv.endDate)
  }

  const getStatusBadge = (attendance: AttendanceRecord | undefined, date: Date) => {
    if (attendance) {
      if (attendance.status === "present") {
        return <Badge className="bg-green-500 hover:bg-green-600 text-white text-[10px] px-1.5 py-0">Present</Badge>
      }
      if (attendance.status === "undertime") {
        return <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[10px] px-1.5 py-0">Undertime</Badge>
      }
      if (attendance.status === "excused") {
        return <Badge className="bg-green-500 hover:bg-green-600 text-white text-[10px] px-1.5 py-0">Excused</Badge>
      }
      return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Absent</Badge>
    }
    // Past day with no attendance — check leave first
    if (isPast(date)) {
      if (isDayOnLeave(date)) {
        return <Badge className="bg-orange-500 hover:bg-orange-600 text-white text-[10px] px-1.5 py-0">On Leave</Badge>
      }
      return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Absent</Badge>
    }
    return null
  }

  if (isLoading && !weekSchedules.length) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Weekly Schedule</h1>
          <p className="text-muted-foreground">Loading your schedule...</p>
        </div>
        <div className="flex justify-center items-center h-64">
          <div className="text-center">
            <div className="text-lg font-medium">Loading schedule data...</div>
            <div className="text-sm text-muted-foreground mt-2">Please wait</div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Weekly Schedule</h1>
          <p className="text-muted-foreground">View your upcoming shifts</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-red-700">
          <p>{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Weekly Schedule</h1>
        <p className="text-muted-foreground">View your upcoming shifts and attendance</p>
      </div>

      <div className="flex justify-between items-center">
        <Button variant="outline" onClick={handlePreviousWeek}>
          <ChevronLeft className="h-4 w-4 mr-2" />
          Previous Week
        </Button>
        <div className="text-lg font-medium">
          {format(startOfCurrentWeek, "MMM d")} - {format(endOfCurrentWeek, "MMM d, yyyy")}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleToday}>
            Today
          </Button>
          <Button variant="outline" onClick={handleNextWeek}>
            Next Week
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-500" /> Present</span>
        <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-amber-500" /> Undertime</span>
        <span className="flex items-center gap-1"><Palmtree className="h-3 w-3 text-orange-500" /> On Leave</span>
        <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-red-500" /> Absent</span>
      </div>

      <div className="grid grid-cols-7 gap-4">
        {weekDays.map((day, index) => {
          const schedule = getScheduleForDay(day)
          const attendance = getAttendanceForDay(day)
          const statusBadge = getStatusBadge(attendance, day)
          const dayIsWeekend = isWeekend(day)

          return (
            <div key={index} className="flex flex-col">
              <div
                className={`text-center p-2 font-medium ${isToday(day) ? "bg-primary text-primary-foreground rounded-t-md" : "bg-muted rounded-t-md"}`}
              >
                <div>{format(day, "EEE")}</div>
                <div>{format(day, "d")}</div>
              </div>
              <Card className={`flex-1 border-t-0 rounded-t-none ${
                attendance?.status === "present" ? "bg-green-50 dark:bg-green-950/20" :
                attendance?.status === "undertime" ? "bg-amber-50 dark:bg-amber-950/20" :
                attendance?.status === "excused" ? "bg-green-50 dark:bg-green-950/20" :
                (isPast(day) && !attendance && isDayOnLeave(day)) ? "bg-orange-50 dark:bg-orange-950/20" :
                (isPast(day) && !attendance) ? "bg-red-50 dark:bg-red-950/10" :
                ""
              }`}>
                <CardContent className="p-3">
                  {schedule || attendance ? (
                    <div className="space-y-2">
                      {/* Shift times — prefer schedule, fallback to attendance times */}
                      <div className="text-sm font-medium">
                        {schedule
                          ? `${formatTime(schedule.startTime)} - ${formatTime(schedule.endTime)}`
                          : attendance?.timeIn
                            ? `${formatTime(attendance.timeIn)}${attendance.timeOut ? ` - ${formatTime(attendance.timeOut)}` : " - ..."}`
                            : "—"
                        }
                      </div>

                      {/* Branch name — prefer schedule, fallback to attendance */}
                      <div className="text-xs text-muted-foreground">
                        {schedule?.branchName || attendance?.branchName || ""}
                      </div>

                      {/* Actual clock-in/out times if different from schedule */}
                      {schedule && attendance?.timeIn && (
                        <div className="text-[10px] text-muted-foreground border-t pt-1">
                          <span>In: {formatTime(attendance.timeIn)}</span>
                          {attendance.timeOut && <span className="ml-1">Out: {formatTime(attendance.timeOut)}</span>}
                        </div>
                      )}

                      {/* Status badge */}
                      {statusBadge && <div>{statusBadge}</div>}

                      {schedule?.notes && (
                        <div className="text-xs mt-1 pt-1 border-t">{schedule.notes}</div>
                      )}
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-xs text-muted-foreground">
                      <span>No shift</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Weekly Shifts</CardTitle>
        </CardHeader>
        <CardContent>
          {weekSchedules.length > 0 || weekAttendance.length > 0 ? (
            <div className="space-y-4">
              {weekDays
                .filter((day) => {
                  const schedule = getScheduleForDay(day)
                  const attendance = getAttendanceForDay(day)
                  return schedule || attendance
                })
                .map((day, idx) => {
                  const schedule = getScheduleForDay(day)
                  const attendance = getAttendanceForDay(day)
                  const statusBadge = getStatusBadge(attendance, day)

                  return (
                    <div key={idx} className={`flex justify-between items-center p-4 border rounded-md ${
                      attendance?.status === "present" ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800" :
                      attendance?.status === "undertime" ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800" :
                      attendance?.status === "excused" ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800" :
                      (isPast(day) && !attendance && isDayOnLeave(day)) ? "bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800" :
                      (isPast(day) && !attendance) ? "bg-red-50 dark:bg-red-950/10 border-red-200 dark:border-red-800" :
                      ""
                    }`}>
                      <div>
                        <div className="font-medium">{format(day, "EEEE, MMMM d, yyyy")}</div>
                        <div className="text-sm text-muted-foreground">
                          {schedule
                            ? `${formatTime(schedule.startTime)} - ${formatTime(schedule.endTime)}`
                            : attendance?.timeIn
                              ? `${formatTime(attendance.timeIn)}${attendance.timeOut ? ` - ${formatTime(attendance.timeOut)}` : ""}`
                              : ""
                          }
                        </div>
                        <div className="text-sm mt-1">{schedule?.branchName || attendance?.branchName || ""}</div>
                        {schedule && attendance?.timeIn && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Actual: {formatTime(attendance.timeIn)}{attendance.timeOut ? ` - ${formatTime(attendance.timeOut)}` : ""}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant={isToday(day) ? "default" : "outline"}>
                          {isToday(day) ? "Today" : format(day, "EEE")}
                        </Badge>
                        {statusBadge}
                      </div>
                    </div>
                  )
                })}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">No shifts scheduled for this week</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
