"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useNotification } from "@/components/notification-provider"
import { useDialog } from "@/components/dialog-provider"
import { useCrewStore } from "@/lib/cleanStore"
import { format, parseISO, differenceInDays } from "date-fns"
import { Calendar, CheckCircle, XCircle } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

export default function LeaveApprovalsPage() {
  const { showNotification } = useNotification()
  const { openConfirmDialog } = useDialog()
  const { leaveRequests, crews, approveLeaveRequest, rejectLeaveRequest } = useCrewStore()
  const [pendingRequests, setPendingRequests] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")

  useEffect(() => {
    // Load pending leave requests
    const requests = leaveRequests.filter((request) => request.status === "pending")
    setPendingRequests(requests)
  }, [leaveRequests])

  const getEmployeeName = (crewId: number) => {
    const crew = crews.find((c) => c.id === crewId)
    return crew ? `${crew.firstName} ${crew.surname}` : "Unknown Employee"
  }

  const handleApprove = (requestId: number) => {
    const request = pendingRequests.find((r) => r.id === requestId)
    if (!request) return

    openConfirmDialog({
      title: "Approve Leave Request",
      description: `Are you sure you want to approve ${getEmployeeName(request.crewId)}'s leave request from ${format(parseISO(request.startDate), "MMM d, yyyy")} to ${format(parseISO(request.endDate), "MMM d, yyyy")}?`,
      confirmLabel: "Approve",
      confirmVariant: "bg-green-600 hover:bg-green-700",
      onConfirm: () => {
        setIsLoading(true)
        try {
          // Use 1 as the reviewer ID (admin)
          approveLeaveRequest(requestId, 1)

          // Update local state
          setPendingRequests((prev) => prev.filter((r) => r.id !== requestId))

          showNotification(
            "success",
            "Leave Request Approved",
            `${getEmployeeName(request.crewId)}'s leave request has been approved.`,
          )
        } catch (error) {
          console.error("Error approving leave request:", error)
          showNotification("error", "Error", "Failed to approve leave request")
        } finally {
          setIsLoading(false)
        }
      },
    })
  }

  const handleReject = (requestId: number) => {
    const request = pendingRequests.find((r) => r.id === requestId)
    if (!request) return

    openConfirmDialog({
      title: "Reject Leave Request",
      description: (
        <div className="space-y-4">
          <p>
            Are you sure you want to reject {getEmployeeName(request.crewId)}'s leave request from{" "}
            {format(parseISO(request.startDate), "MMM d, yyyy")} to {format(parseISO(request.endDate), "MMM d, yyyy")}?
          </p>
          <div className="space-y-2">
            <Label htmlFor="rejectionReason">Reason for rejection (optional):</Label>
            <Textarea
              id="rejectionReason"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Provide a reason for rejecting this leave request"
              className="resize-none"
            />
          </div>
        </div>
      ),
      confirmLabel: "Reject",
      confirmVariant: "bg-red-600 hover:bg-red-700",
      onConfirm: () => {
        setIsLoading(true)
        try {
          // Use 1 as the reviewer ID (admin)
          rejectLeaveRequest(requestId, 1, rejectionReason)

          // Update local state
          setPendingRequests((prev) => prev.filter((r) => r.id !== requestId))

          showNotification(
            "info",
            "Leave Request Rejected",
            `${getEmployeeName(request.crewId)}'s leave request has been rejected.`,
          )

          // Reset rejection reason
          setRejectionReason("")
        } catch (error) {
          console.error("Error rejecting leave request:", error)
          showNotification("error", "Error", "Failed to reject leave request")
        } finally {
          setIsLoading(false)
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
          {pendingRequests.length > 0 ? (
            <div className="space-y-4">
              {pendingRequests.map((request) => {
                const startDate = parseISO(request.startDate)
                const endDate = parseISO(request.endDate)
                const days = differenceInDays(endDate, startDate) + 1

                return (
                  <div key={request.id} className="p-4 border rounded-md bg-amber-50 dark:bg-amber-950/20">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-lg">{getEmployeeName(request.crewId)}</h3>
                          <Badge variant="outline" className="capitalize">
                            {request.type} Leave
                          </Badge>
                        </div>

                        <div className="text-sm text-muted-foreground mt-1">
                          {format(startDate, "MMM d, yyyy")} - {format(endDate, "MMM d, yyyy")} ({days} day
                          {days !== 1 ? "s" : ""})
                        </div>

                        {request.reason && (
                          <div className="mt-2 text-sm">
                            <span className="text-muted-foreground">Reason: </span>
                            {request.reason}
                          </div>
                        )}

                        <div className="text-xs text-muted-foreground mt-2">
                          Requested on {format(parseISO(request.createdAt), "MMM d, yyyy")}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="border-green-500 text-green-600 hover:bg-green-50 hover:text-green-700"
                          onClick={() => handleApprove(request.id)}
                          disabled={isLoading}
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Approve
                        </Button>

                        <Button
                          variant="outline"
                          className="border-red-500 text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => handleReject(request.id)}
                          disabled={isLoading}
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
