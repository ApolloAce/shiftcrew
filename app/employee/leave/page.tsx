"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useNotification } from "@/components/notification-provider"
import { format, differenceInDays } from "date-fns"
import { Calendar, FileText, Plus } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function EmployeeLeavePage() {
  const { showNotification } = useNotification()

  const [currentUser, setCurrentUser] = useState<{
    id: number | string
    firstName: string
    surname: string
    type?: string
  } | null>(null)
  const [employeeType, setEmployeeType] = useState<string>("full-time")
  const [leaveRequests, setLeaveRequests] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [reasonTemplate, setReasonTemplate] = useState("")

  const [leaveForm, setLeaveForm] = useState({
    startDate: format(new Date(), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
    type: "sick",
    reason: "",
  })

  useEffect(() => {
    const user = sessionStorage.getItem("currentUser")
    if (!user) return

    try {
      const userData = JSON.parse(user)
      setCurrentUser(userData)
      setEmployeeType(userData.type || "full-time")

      if (userData.id) {
        fetchLeaveRequests(userData.id)
      }
    } catch (error) {
      console.error("Error loading leave data:", error)
    }
  }, [])

  const fetchLeaveRequests = async (employeeId: string | number) => {
    try {
      const res = await fetch(`/api/leave?employeeId=${employeeId}`)
      if (res.ok) {
        const data = await res.json()
        setLeaveRequests(Array.isArray(data) ? data : [])
      }
    } catch (error) {
      console.error("Error fetching leave requests:", error)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setLeaveForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSelectChange = (name: string, value: string) => {
    setLeaveForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async () => {
    if (!currentUser) return

    // Validate dates
    const startDate = new Date(leaveForm.startDate)
    const endDate = new Date(leaveForm.endDate)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      showNotification("error", "Invalid Dates", "Please select valid start and end dates.")
      return
    }

    if (startDate < today) {
      showNotification("error", "Invalid Start Date", "Start date cannot be in the past.")
      return
    }

    if (endDate < startDate) {
      showNotification("error", "Invalid Dates", "End date cannot be before start date.")
      return
    }

    if (!leaveForm.type) {
      showNotification("error", "Missing Information", "Please select a leave type.")
      return
    }

    if (!reasonTemplate) {
      showNotification("error", "Missing Information", "Please select a reason for your leave request.")
      return
    }

    if (reasonTemplate === "others" && !leaveForm.reason.trim()) {
      showNotification("error", "Missing Information", "Please specify the reason for your leave request.")
      return
    }

    setIsLoading(true)
    try {
      const res = await fetch("/api/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: currentUser.id,
          employeeName: `${currentUser.firstName} ${currentUser.surname}`,
          startDate: leaveForm.startDate,
          endDate: leaveForm.endDate,
          type: leaveForm.type,
          reason: reasonTemplate === "others" ? `Others: ${leaveForm.reason}` : reasonTemplate,
          status: "pending",
        }),
      })

      if (res.ok) {
        // Refresh leave requests
        fetchLeaveRequests(currentUser.id)

        // Reset form and close dialog
        setLeaveForm({
          startDate: format(new Date(), "yyyy-MM-dd"),
          endDate: format(new Date(), "yyyy-MM-dd"),
          type: "vacation",
          reason: "",
        })
        setReasonTemplate("")

        setIsDialogOpen(false)
        window.dispatchEvent(new Event("leave-updated"))
        showNotification("success", "Leave Request Submitted", "Your leave request has been submitted for approval.")
      } else {
        showNotification("error", "Error", "Failed to submit leave request. Please try again.")
      }
    } catch (error) {
      console.error("Error submitting leave request:", error)
      showNotification("error", "Error", "Failed to submit leave request. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-500">Approved</Badge>
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>
      default:
        return <Badge variant="outline">Pending</Badge>
    }
  }

  const getLeaveStatusClass = (status: string) => {
    switch (status) {
      case "approved":
        return "border-green-200 bg-green-50 dark:bg-green-950/20"
      case "rejected":
        return "border-red-200 bg-red-50 dark:bg-red-950/20"
      default:
        return "border-amber-200 bg-amber-50 dark:bg-amber-950/20"
    }
  }

  useEffect(() => {
    if (!isDialogOpen && currentUser) {
      fetchLeaveRequests(currentUser.id)
    }
  }, [isDialogOpen])

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leave Requests</h1>
          <p className="text-muted-foreground">Manage your leave requests and time off</p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2" onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              New Request
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request Leave</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    name="startDate"
                    type="date"
                    value={leaveForm.startDate}
                    onChange={handleInputChange}
                    min={format(new Date(), "yyyy-MM-dd")}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    name="endDate"
                    type="date"
                    value={leaveForm.endDate}
                    onChange={handleInputChange}
                    min={leaveForm.startDate}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">Leave Type</Label>
                <Select value={leaveForm.type} onValueChange={(value) => handleSelectChange("type", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select leave type" />
                  </SelectTrigger>
                  <SelectContent>
                    {employeeType !== "part-time" && <SelectItem value="vacation">Vacation</SelectItem>}
                    <SelectItem value="sick">Sick Leave</SelectItem>
                    <SelectItem value="personal">Personal Leave</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Reason</Label>
                <Select value={reasonTemplate} onValueChange={(value) => {
                  setReasonTemplate(value)
                  if (value !== "others") {
                    setLeaveForm((prev) => ({ ...prev, reason: value }))
                  } else {
                    setLeaveForm((prev) => ({ ...prev, reason: "" }))
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Not feeling well">Not feeling well</SelectItem>
                    <SelectItem value="Medical / Dental appointment">Medical / Dental appointment</SelectItem>
                    <SelectItem value="Family emergency">Family emergency</SelectItem>
                    <SelectItem value="Personal errands">Personal errands</SelectItem>
                    <SelectItem value="Mental health day">Mental health day</SelectItem>
                    <SelectItem value="others">Others</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {reasonTemplate === "others" && (
                <div className="space-y-2">
                  <Label htmlFor="reason">Specify Reason</Label>
                  <Input
                    id="reason"
                    name="reason"
                    placeholder="Please specify your reason"
                    value={leaveForm.reason}
                    onChange={handleInputChange}
                  />
                </div>
              )}

              <Button
                className="w-full"
                onClick={handleSubmit}
                disabled={isLoading || !leaveForm.startDate || !leaveForm.endDate || !reasonTemplate || (reasonTemplate === "others" && !leaveForm.reason.trim())}
              >
                {isLoading ? "Submitting..." : "Submit Request"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Calendar className="mr-2 h-5 w-5 text-primary" />
            Leave History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {leaveRequests.length > 0 ? (
            <div className="space-y-4">
              {leaveRequests
                .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
                .map((request, idx) => {
                  const startDate = new Date(request.startDate + "T00:00:00")
                  const endDate = new Date(request.endDate + "T00:00:00")
                  const days = differenceInDays(endDate, startDate) + 1

                  return (
                    <div key={request.id || idx} className={`p-4 border rounded-md ${getLeaveStatusClass(request.status)}`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <div className="font-medium capitalize">{request.type || "General"} Leave</div>
                            {getStatusBadge(request.status)}
                          </div>

                          <div className="text-sm text-muted-foreground mt-1">
                            {format(startDate, "MMM d, yyyy")} - {format(endDate, "MMM d, yyyy")} ({days} day
                            {days !== 1 ? "s" : ""})
                          </div>

                          {request.reason && (() => {
                            const reason = String(request.reason)
                            const isOthers = reason.startsWith("Others: ")
                            return (
                              <div className="mt-2 text-sm flex items-start gap-2">
                                <Badge variant="outline" className="shrink-0 text-xs">{isOthers ? "Others" : "Reason"}</Badge>
                                <span>{isOthers ? reason.slice(8) : reason}</span>
                              </div>
                            )
                          })()}

                          {request.notes && request.status === "rejected" && (
                            <div className="mt-2 text-sm text-red-600 dark:text-red-400">
                              <span className="font-medium">Rejection reason: </span>
                              {request.notes}
                            </div>
                          )}
                        </div>

                        <div className="text-xs text-muted-foreground">
                          Requested on {request.createdAt ? format(new Date(request.createdAt), "MMM d, yyyy") : "N/A"}
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">No leave requests found</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <FileText className="mr-2 h-5 w-5 text-primary" />
            Leave Policy
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {employeeType !== "part-time" && (
            <div>
              <h3 className="text-lg font-medium">Vacation Leave</h3>
              <p className="text-sm text-muted-foreground">
                Full-time employees are entitled to 15 days of paid vacation leave per year.
              </p>
            </div>
            )}

            <div>
              <h3 className="text-lg font-medium">Sick Leave</h3>
              <p className="text-sm text-muted-foreground">
                Employees are entitled to 10 days of paid sick leave per year. A doctor's note may be required for sick
                leave exceeding 3 consecutive days.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-medium">Personal Leave</h3>
              <p className="text-sm text-muted-foreground">
                Employees may take up to 3 days of personal leave per year for matters that cannot be scheduled outside
                work hours.
              </p>
            </div>

            <div className="pt-4 border-t">
              <h3 className="text-lg font-medium">Request Process</h3>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 mt-2">
                <li>Submit leave requests at least 2 weeks in advance for vacation leave.</li>
                <li>Sick leave should be reported as soon as possible.</li>
                <li>All leave requests are subject to manager approval.</li>
                <li>Leave may be denied during peak business periods.</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
