"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useNotification } from "@/components/notification-provider"
import { format, parseISO } from "date-fns"
import { Bell, CheckCircle, AlertCircle, Info, Calendar } from "lucide-react"

export default function EmployeeNotificationsPage() {
  const { showNotification } = useNotification()

  const [currentUser, setCurrentUser] = useState<{ id: number | string } | null>(null)
  const [notifications, setNotifications] = useState<any[]>([])
  const [upcomingShifts, setUpcomingShifts] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const fetchNotifications = async (userId: string) => {
    try {
      const res = await fetch(`/api/notifications?recipientId=${userId}`)
      if (res.ok) {
        const data = await res.json()
        setNotifications(Array.isArray(data) ? data : [])
      }
    } catch (error) {
      console.error("Error fetching notifications:", error)
    }
  }

  useEffect(() => {
    const user = sessionStorage.getItem("currentUser")
    if (!user) return

    try {
      const userData = JSON.parse(user)
      setCurrentUser(userData)

      if (userData.id) {
        // Fetch notifications from the MySQL-backed API
        fetchNotifications(String(userData.id))

        // Fetch upcoming shifts from API
        fetchUpcomingShifts(userData)
      }
    } catch (error) {
      console.error("Error loading notifications:", error)
    }
  }, [])

  const fetchUpcomingShifts = async (userData: any) => {
    try {
      const today = new Date().toISOString().split("T")[0]
      // Only fetch current and future schedules instead of all
      const mondayDate = new Date()
      const dayOfWeek = mondayDate.getDay()
      mondayDate.setDate(mondayDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1))
      const weekStart = mondayDate.toISOString().split("T")[0]
      const res = await fetch(`/api/schedules?weekStart=${weekStart}`)
      if (!res.ok) return

      const schedules = await res.json()
      const shifts: any[] = []

      if (Array.isArray(schedules)) {
        for (const sched of schedules) {
          const schedDate = sched.scheduleFor || sched.date
          if (schedDate < today) continue

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
                // Map shift string to actual times
                const shiftTimes = typeof found.shift === "string" ? (() => {
                  switch (found.shift.toUpperCase()) {
                    case "AM": return { start: "07:00", end: "14:00" }
                    case "PM": return { start: "14:00", end: "22:00" }
                    default: return { start: "", end: "" }
                  }
                })() : null
                shifts.push({
                  id: sched.id,
                  date: sched.scheduleFor || sched.date,
                  startTime: shiftObj?.start || found.shiftStart || shiftTimes?.start || sched.time || "TBD",
                  endTime: shiftObj?.end || found.shiftEnd || shiftTimes?.end || "TBD",
                  branchName: branch.branchName || "Unknown",
                  notes: sched.notes,
                })
              }
            }
          }
        }
      }

      // Sort by date and take first 3
      shifts.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      setUpcomingShifts(shifts.slice(0, 3))
    } catch (error) {
      console.error("Error fetching upcoming shifts:", error)
    }
  }

  const handleMarkAsRead = async (notificationId: string | number) => {
    if (!currentUser) return

    setIsLoading(true)
    try {
      await fetch("/api/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: notificationId }),
      })

      await fetchNotifications(String(currentUser.id))
      showNotification("success", "Notification Marked as Read", "The notification has been marked as read.")
    } catch (error) {
      console.error("Error marking notification as read:", error)
      showNotification("error", "Error", "Failed to mark notification as read. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleMarkAllAsRead = async () => {
    if (!currentUser) return

    setIsLoading(true)
    try {
      await fetch("/api/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: String(currentUser.id), markAllRead: true }),
      })

      await fetchNotifications(String(currentUser.id))
      showNotification("success", "All Notifications Marked as Read", "All notifications have been marked as read.")
    } catch (error) {
      console.error("Error marking all notifications as read:", error)
      showNotification("error", "Error", "Failed to mark all notifications as read. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "success":
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case "error":
        return <AlertCircle className="h-5 w-5 text-red-500" />
      case "warning":
        return <AlertCircle className="h-5 w-5 text-amber-500" />
      case "info":
      default:
        return <Info className="h-5 w-5 text-blue-500" />
    }
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground">Stay updated with important announcements and updates</p>
        </div>

        {unreadCount > 0 && (
          <Button variant="outline" onClick={handleMarkAllAsRead} disabled={isLoading}>
            Mark All as Read
          </Button>
        )}
      </div>

      {/* Upcoming Shift Reminders */}
      {upcomingShifts.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center">
              <Calendar className="mr-2 h-5 w-5 text-primary" />
              Upcoming Shift Reminders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {upcomingShifts.map((shift, idx) => {
                const shiftDate = new Date(shift.date + "T00:00:00")
                const isToday = shift.date === new Date().toISOString().split("T")[0]

                return (
                  <div key={shift.id || idx} className="p-4 border rounded-md bg-blue-50 dark:bg-blue-950/20">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">
                          Shift on {format(shiftDate, "EEEE, MMMM d, yyyy")}
                        </div>
                        <div className="text-sm mt-1">
                          Time: {shift.startTime} - {shift.endTime}
                        </div>
                        <div className="text-sm mt-1 text-muted-foreground">
                          Branch: {shift.branchName}
                        </div>
                        {shift.notes && (
                          <div className="text-sm mt-1 text-muted-foreground">Note: {shift.notes}</div>
                        )}
                      </div>
                      <Badge className={isToday ? "bg-green-500" : ""}>
                        {isToday ? "Today" : format(shiftDate, "MMM d")}
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center">
            <Bell className="mr-2 h-5 w-5 text-primary" />
            All Notifications
          </CardTitle>

          {unreadCount > 0 && <Badge>{unreadCount} unread</Badge>}
        </CardHeader>
        <CardContent>
          {notifications.length > 0 ? (
            <div className="space-y-4">
              {notifications
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-4 border rounded-md ${!notification.isRead ? "bg-muted/30 border-primary/30" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">{getNotificationIcon(notification.type)}</div>

                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <div className="font-medium">{notification.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {notification.createdAt
                              ? format(parseISO(notification.createdAt), "MMM d, yyyy h:mm a")
                              : ""}
                          </div>
                        </div>

                        <div className="text-sm mt-1">{notification.message}</div>

                        {!notification.isRead && (
                          <div className="mt-3">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleMarkAsRead(notification.id)}
                              disabled={isLoading}
                            >
                              Mark as Read
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">No notifications found</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
