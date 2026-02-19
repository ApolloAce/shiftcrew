"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { format, startOfWeek, endOfWeek, eachDayOfInterval, subWeeks, addWeeks } from "date-fns"
import { ChevronLeft, ChevronRight } from "lucide-react"
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

export default function EmployeeSchedulePage() {
  const [currentUser, setCurrentUser] = useState<{ id: number | string } | null>(null)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [weekSchedules, setWeekSchedules] = useState<EmployeeShift[]>([])
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

  // Compute week start as a string for stable dependency comparison
  const weekStartStr = useMemo(() => format(startOfCurrentWeek, "yyyy-MM-dd"), [startOfCurrentWeek])

  // Fetch schedules for the current week from API
  useEffect(() => {
    if (!currentUser?.id) return

    // Clear old data immediately so stale schedules don't show
    setWeekSchedules([])
    setIsLoading(true)
    setError(null)

    const fetchSchedules = async () => {
      try {
        const res = await fetch(`/api/schedules?weekStart=${weekStartStr}`)

        if (!res.ok) {
          throw new Error("Failed to fetch schedules")
        }

        const schedules = await res.json()
        const employeeShifts: EmployeeShift[] = []

        if (Array.isArray(schedules)) {
          for (const sched of schedules) {
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
                  // shift can be a string ("AM") or object ({start, end})
                  const shiftObj = typeof found.shift === "object" && found.shift ? found.shift : null
                  employeeShifts.push({
                    date: sched.scheduleFor || sched.date,
                    startTime: shiftObj?.start || sched.time || "",
                    endTime: shiftObj?.end || "",
                    branchName: branch.branchName || "Unknown Branch",
                    branchId: branch.branchId || "",
                    notes: sched.notes,
                  })
                }
              }
            }
          }
        }

        setWeekSchedules(employeeShifts)
      } catch (error) {
        console.error("Error loading schedule data:", error)
        setError("Failed to load schedule data. Please try again.")
        setWeekSchedules([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchSchedules()
  }, [currentUser, weekStartStr])

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

  const isToday = (date: Date) => {
    const today = new Date()
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    )
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
        <p className="text-muted-foreground">View your upcoming shifts</p>
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

      <div className="grid grid-cols-7 gap-4">
        {weekDays.map((day, index) => (
          <div key={index} className="flex flex-col">
            <div
              className={`text-center p-2 font-medium ${isToday(day) ? "bg-primary text-primary-foreground rounded-t-md" : "bg-muted rounded-t-md"}`}
            >
              <div>{format(day, "EEE")}</div>
              <div>{format(day, "d")}</div>
            </div>
            <Card className="flex-1 border-t-0 rounded-t-none">
              <CardContent className="p-3">
                {getScheduleForDay(day) ? (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">
                      {formatTime(getScheduleForDay(day)!.startTime)} - {formatTime(getScheduleForDay(day)!.endTime)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {getScheduleForDay(day)!.branchName}
                    </div>
                    {getScheduleForDay(day)?.notes && (
                      <div className="text-xs mt-2 pt-2 border-t">{getScheduleForDay(day)?.notes}</div>
                    )}
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground">No shift</div>
                )}
              </CardContent>
            </Card>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming Shifts</CardTitle>
        </CardHeader>
        <CardContent>
          {weekSchedules.length > 0 ? (
            <div className="space-y-4">
              {weekSchedules
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                .map((schedule, idx) => (
                  <div key={idx} className="flex justify-between items-center p-4 border rounded-md">
                    <div>
                      <div className="font-medium">{format(new Date(schedule.date + "T00:00:00"), "EEEE, MMMM d, yyyy")}</div>
                      <div className="text-sm text-muted-foreground">
                        {formatTime(schedule.startTime)} - {formatTime(schedule.endTime)}
                      </div>
                      <div className="text-sm mt-1">{schedule.branchName}</div>
                    </div>
                    <Badge variant={isToday(new Date(schedule.date + "T00:00:00")) ? "default" : "outline"}>
                      {isToday(new Date(schedule.date + "T00:00:00")) ? "Today" : format(new Date(schedule.date + "T00:00:00"), "EEE")}
                    </Badge>
                  </div>
                ))}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">No shifts scheduled for this week</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
