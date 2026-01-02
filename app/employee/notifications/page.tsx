"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useNotification } from "@/components/notification-provider"
import { useCrewStore } from "@/lib/cleanStore"
import { format, parseISO } from "date-fns"
import { Bell, CheckCircle, AlertCircle, Info, Calendar } from "lucide-react"

export default function EmployeeNotificationsPage() {
  const { showNotification } = useNotification()
  const { getNotificationsForCrew, markNotificationAsRead, getSchedulesForCrew } = useCrewStore()

  const [currentUser, setCurrentUser] = useState<{ id: number } | null>(null)
  const [notifications, setNotifications] = useState<any[]>([])
  const [upcomingShifts, setUpcomingShifts] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    // Get current user from session storage
    const user = sessionStorage.getItem("currentUser")
    if (!user) return

    try {
      const userData = JSON.parse(user)
      setCurrentUser(userData)

      if (userData.id) {
        // Get notifications
        const userNotifications = getNotificationsForCrew(userData.id)
        setNotifications(userNotifications)

        // Get upcoming shifts for reminders
        const schedules = getSchedulesForCrew(userData.id)
        const today = new Date().toISOString().split("T")[0]
        const upcoming = schedules
          .filter((s) => s.date >= today)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .slice(0, 3)
        setUpcomingShifts(upcoming)
      }
    } catch (error) {
      console.error("Error loading notifications:", error)
    }
  }, [getNotificationsForCrew, getSchedulesForCrew])

  const handleMarkAsRead = (notificationId: number) => {
    if (!currentUser) return

    setIsLoading(true)
    try {
      markNotificationAsRead(notificationId)

      // Refresh notifications
      const userNotifications = getNotificationsForCrew(currentUser.id)
      setNotifications(userNotifications)

      showNotification("success", "Notification Marked as Read", "The notification has been marked as read.")
    } catch (error) {
      console.error("Error marking notification as read:", error)
      showNotification("error", "Error", "Failed to mark notification as read. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleMarkAllAsRead = () => {
    if (!currentUser) return

    setIsLoading(true)
    try {
      // Mark all unread notifications as read
      notifications.filter((n) => !n.isRead).forEach((n) => markNotificationAsRead(n.id))

      // Refresh notifications
      const userNotifications = getNotificationsForCrew(currentUser.id)
      setNotifications(userNotifications)

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
              {upcomingShifts.map((shift) => (
                <div key={shift.id} className="p-4 border rounded-md bg-blue-50 dark:bg-blue-950/20">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium">Shift on {format(parseISO(shift.date), "EEEE, MMMM d, yyyy")}</div>
                      <div className="text-sm mt-1">
                        Time: {shift.startTime.substring(0, 5)} - {shift.endTime.substring(0, 5)}
                      </div>
                      {shift.notes && <div className="text-sm mt-1 text-muted-foreground">Note: {shift.notes}</div>}
                    </div>
                    <Badge
                      className={
                        parseISO(shift.date).toISOString().split("T")[0] === new Date().toISOString().split("T")[0]
                          ? "bg-green-500"
                          : ""
                      }
                    >
                      {parseISO(shift.date).toISOString().split("T")[0] === new Date().toISOString().split("T")[0]
                        ? "Today"
                        : format(parseISO(shift.date), "MMM d")}
                    </Badge>
                  </div>
                </div>
              ))}
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
                            {format(parseISO(notification.createdAt), "MMM d, yyyy h:mm a")}
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
