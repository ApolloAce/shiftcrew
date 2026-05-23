"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useNotification } from "@/components/notification-provider"
import { useDialog } from "@/components/dialog-provider"
import { getActiveEmployees } from "@/lib/firestore-employee-service"
import { getAllLeaveRequests, approveLeaveRequest, rejectLeaveRequest } from "@/lib/firestore-leave-service"
import { format, parseISO, differenceInDays } from "date-fns"
import { Calendar, CheckCircle, XCircle, User, Clock, FileText } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

export default function LeaveApprovalsPage() {
  const { showNotification } = useNotification()
  const { openConfirmDialog } = useDialog()
  const [employees, setEmployees] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [pendingRequests, setPendingRequests] = useState<any[]>([])
  const [rejectionReason, setRejectionReason] = useState("")
  const rejectionReasonRef = useRef("")

  const fetchData = async () => {
    try {
      setIsLoading(true)
      const [emps, leaves] = await Promise.all([getActiveEmployees(), getAllLeaveRequests()])
      setEmployees(emps)
      // Show pending requests (or all if you want history)
      setPendingRequests(leaves.filter((l: any) => l.status === "pending"))
    } catch (error) {
      console.error("Leave Approvals: Error fetching data:", error)
      showNotification("error", "Error", "Failed to load leave data")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getEmployeeName = (employeeId: string | number) => {
    const emp = employees.find((e) => String(e.id) === String(employeeId))
    return emp ? `${emp.firstName} ${emp.surname}` : "Unknown Employee"
  }

  const handleApprove = (requestId: string) => {
    const request = pendingRequests.find((r) => r.id === requestId)
    if (!request) return

    openConfirmDialog({
      title: "Approve Leave Request",
      description: `Are you sure you want to approve ${getEmployeeName(request.employeeId)}'s leave request from ${format(parseISO(request.startDate), "MMM d, yyyy")} to ${format(parseISO(request.endDate), "MMM d, yyyy")}?`,
      confirmLabel: "Approve",
      confirmVariant: "bg-green-600 hover:bg-green-700",
      onConfirm: async () => {
        try {
          await approveLeaveRequest(requestId)
          setPendingRequests((prev) => prev.filter((r) => r.id !== requestId))
          window.dispatchEvent(new Event("leave-updated"))
          showNotification(
            "success",
            "Leave Request Approved",
            `${getEmployeeName(request.employeeId)}'s leave request has been approved.`,
          )
        } catch (error) {
          console.error("Error approving leave request:", error)
          showNotification("error", "Error", "Failed to approve leave request")
        }
      },
    })
  }

  const handleReject = (requestId: string) => {
    const request = pendingRequests.find((r) => r.id === requestId)
    if (!request) return

    openConfirmDialog({
      title: "Reject Leave Request",
      description: (
        <div className="space-y-4">
          <p>
            Are you sure you want to reject {getEmployeeName(request.employeeId)}&apos;s leave request from{" "}
            {format(parseISO(request.startDate), "MMM d, yyyy")} to {format(parseISO(request.endDate), "MMM d, yyyy")}?
          </p>
          <div className="space-y-2">
            <Label htmlFor="rejectionReason">Reason for rejection:</Label>
            <Textarea
              id="rejectionReason"
              defaultValue=""
              onChange={(e) => { rejectionReasonRef.current = e.target.value }}
              placeholder="Provide a reason for rejecting this leave request"
              className="resize-none"
            />
          </div>
        </div>
      ),
      confirmLabel: "Reject",
      confirmVariant: "bg-red-600 hover:bg-red-700",
      onConfirm: async () => {
        try {
          const reason = rejectionReasonRef.current.trim()
          await rejectLeaveRequest(requestId, reason || undefined)
          setPendingRequests((prev) => prev.filter((r) => r.id !== requestId))
          window.dispatchEvent(new Event("leave-updated"))
          showNotification(
            "info",
            "Leave Request Rejected",
            `${getEmployeeName(request.employeeId)}'s leave request has been rejected.${reason ? ` Reason: ${reason}` : ""}`,
          )
          rejectionReasonRef.current = ""
        } catch (error) {
          console.error("Error rejecting leave request:", error)
          showNotification("error", "Error", "Failed to reject leave request")
        }
      },
    })
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Leave Request Approvals</h1>
        <p className="text-muted-foreground">Review and manage employee leave requests</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Calendar className="mr-2 h-5 w-5 text-primary" />
            Pending Leave Requests
            {pendingRequests.length > 0 && <Badge className="ml-2 bg-amber-500">{pendingRequests.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading employee data...</div>
          ) : pendingRequests.length > 0 ? (
            <div className="space-y-4">
              {pendingRequests.map((request) => {
                const startDate = parseISO(request.startDate)
                const endDate = parseISO(request.endDate)
                const days = differenceInDays(endDate, startDate) + 1

                return (
                  <div key={request.id} className="border rounded-lg overflow-hidden shadow-sm">
                    <div className="bg-amber-50 dark:bg-amber-950/20 px-5 py-3 border-b flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                          <User className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-base">{getEmployeeName(request.employeeId)}</h3>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Requested {request.createdAt ? format(new Date(request.createdAt), "MMM d, yyyy") : format(new Date(), "MMM d, yyyy")}
                          </div>
                        </div>
                      </div>
                      <Badge className="capitalize bg-amber-500 hover:bg-amber-600 text-white">
                        {String(request.type || "Leave")}
                      </Badge>
                    </div>

                    <div className="px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{format(startDate, "MMM d, yyyy")} – {format(endDate, "MMM d, yyyy")}</span>
                          <Badge variant="secondary" className="text-xs">{days} day{days !== 1 ? "s" : ""}</Badge>
                        </div>

                        {request.reason && (() => {
                          const reason = String(request.reason)
                          const isOthers = reason.startsWith("Others: ")
                          return (
                            <div className="flex items-start gap-2 text-sm">
                              <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                              {isOthers && <Badge variant="outline" className="shrink-0 text-xs">Others</Badge>}
                              <span className="text-muted-foreground">{isOthers ? reason.slice(8) : reason}</span>
                            </div>
                          )
                        })()}
                      </div>

                      <div className="flex gap-2 shrink-0">
                        <Button
                          className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => handleApprove(request.id)}
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Approve
                        </Button>

                        <Button
                          variant="outline"
                          className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => handleReject(request.id)}
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">No pending leave requests</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
