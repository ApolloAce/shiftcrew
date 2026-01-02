"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useNotification } from "@/components/notification-provider"
import { useCrewStore } from "@/lib/cleanStore"
import { format, parseISO } from "date-fns"
import { Calendar, Clock, MapPin, AlertCircle, ShieldAlert } from "lucide-react"

export default function EmployeeDashboard() {
  const { showNotification } = useNotification()
  const {
    getLatestTimeRecord,
    clockIn,
    clockOut,
    getAssignedBranch,
    getSchedulesForCrew,
    getLeaveRequestsForCrew,
    getNotificationsForCrew,
    crews,
  } = useCrewStore()

  const [currentUser, setCurrentUser] = useState<{
    id: number
    firstName: string
    surname: string
    status?: string
  } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [todaySchedule, setTodaySchedule] = useState<any | null>(null)
  const [latestTimeRecord, setLatestTimeRecord] = useState<any | null>(null)
  const [assignedBranch, setAssignedBranch] = useState<any | null>(null)
  const [pendingLeaves, setPendingLeaves] = useState<any[]>([])
  const [unreadNotifications, setUnreadNotifications] = useState<any[]>([])
  const [accountStatus, setAccountStatus] = useState<"pending" | "approved" | "rejected" | undefined>(undefined)

  // Demo auto-population removed so the app starts with a fresh empty state.
  // Demo accounts remain visible on the login page but no data is auto-seeded here.

  // Single useEffect to load all data at once
  useEffect(() => {
    // Get current user from session storage
    const user = sessionStorage.getItem("currentUser")
    if (!user) return

    try {
      const userData = JSON.parse(user)
      setCurrentUser(userData)

      if (userData.id) {
        // Get account status
        const crew = crews.find((c) => c.id === userData.id)
        if (crew) {
          setAccountStatus(crew.status)
        }

        // Only load other data if account is approved
        if (crew?.status === "approved") {
          // Get assigned branch
          const branch = getAssignedBranch(userData.id)
          setAssignedBranch(branch)

          // Get today's schedule
          const today = new Date().toISOString().split("T")[0]
          const schedules = getSchedulesForCrew(userData.id)
          const todaySchedule = schedules.find((s) => s.date === today)
          setTodaySchedule(todaySchedule)

          // Get latest time record
          const timeRecord = getLatestTimeRecord(userData.id)
          setLatestTimeRecord(timeRecord)

          // Get pending leave requests
          const leaveRequests = getLeaveRequestsForCrew(userData.id)
          setPendingLeaves(leaveRequests.filter((lr) => lr.status === "pending"))

          // Get unread notifications
          const notifications = getNotificationsForCrew(userData.id)
          setUnreadNotifications(notifications.filter((n) => !n.isRead))
        }
      }
    } catch (error) {
      console.error("Error loading employee data:", error)
    }
  }, [
    getAssignedBranch,
    getLatestTimeRecord,
    getLeaveRequestsForCrew,
    getNotificationsForCrew,
    getSchedulesForCrew,
    crews,
  ])

  const handleClockIn = async () => {
    if (!currentUser) return

    setIsLoading(true)
    try {
      clockIn(currentUser.id)
      const updatedRecord = getLatestTimeRecord(currentUser.id)
      setLatestTimeRecord(updatedRecord)
      showNotification("success", "Clocked In", `You have successfully clocked in at ${updatedRecord?.timeIn}`)
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
      clockOut(currentUser.id)
      const updatedRecord = getLatestTimeRecord(currentUser.id)
      setLatestTimeRecord(updatedRecord)
      showNotification("success", "Clocked Out", `You have successfully clocked out at ${updatedRecord?.timeOut}`)
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
                    {formatTime(todaySchedule.startTime)} - {formatTime(todaySchedule.endTime)}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-muted-foreground">Branch:</div>
                  <div className="font-medium">{assignedBranch?.branchName || "Unassigned"}</div>
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
                <Badge variant={latestTimeRecord && !latestTimeRecord.timeOut ? "default" : "outline"}>
                  {latestTimeRecord && !latestTimeRecord.timeOut ? "Clocked In" : "Not Clocked In"}
                </Badge>
              </div>

              {latestTimeRecord && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="text-sm text-muted-foreground">Time In:</div>
                    <div className="font-medium">{formatTime(latestTimeRecord.timeIn)}</div>
                  </div>

                  {latestTimeRecord.timeOut && (
                    <div className="flex justify-between items-center">
                      <div className="text-sm text-muted-foreground">Time Out:</div>
                      <div className="font-medium">{formatTime(latestTimeRecord.timeOut)}</div>
                    </div>
                  )}
                </div>
              )}

              <div className="pt-2">
                {!latestTimeRecord || latestTimeRecord.timeOut ? (
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
                {pendingLeaves.map((leave) => (
                  <div key={leave.id} className="p-3 border rounded-md">
                    <div className="flex justify-between">
                      <div className="font-medium">
                        {leave.type.charAt(0).toUpperCase() + leave.type.slice(1)} Leave
                      </div>
                      <Badge variant="outline">Pending</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {format(parseISO(leave.startDate), "MMM d, yyyy")} -{" "}
                      {format(parseISO(leave.endDate), "MMM d, yyyy")}
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

        {/* Recent Notifications */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <AlertCircle className="mr-2 h-5 w-5 text-primary" />
              Recent Notifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            {unreadNotifications.length > 0 ? (
              <div className="space-y-4">
                {unreadNotifications.slice(0, 3).map((notification) => (
                  <div key={notification.id} className="p-3 border rounded-md">
                    <div className="font-medium">{notification.title}</div>
                    <div className="text-sm mt-1">{notification.message}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {format(parseISO(notification.createdAt), "MMM d, yyyy h:mm a")}
                    </div>
                  </div>
                ))}
                {unreadNotifications.length > 3 && (
                  <Button
                    variant="link"
                    className="w-full"
                    onClick={() => (window.location.href = "/employee/notifications")}
                  >
                    View all notifications
                  </Button>
                )}
              </div>
            ) : (
              <div className="py-6 text-center text-muted-foreground">No unread notifications</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
