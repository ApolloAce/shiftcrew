"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useNotification } from "@/components/notification-provider"
import { useDialog } from "@/components/dialog-provider"
import { useCrewStore } from "@/lib/cleanStore"
import { format, parseISO, addDays } from "date-fns"
import { AlertTriangle, CheckCircle, XCircle, FileText } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

export default function AbsencesPage() {
  const { showNotification } = useNotification()
  const { openConfirmDialog } = useDialog()
  const { crews, getActiveCrews, getAssignedBranch, addNotification } = useCrewStore()
  const [activeTab, setActiveTab] = useState("unplanned")
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  // Mock data for absences - in a real app, this would come from the store
  const [unplannedAbsences, setUnplannedAbsences] = useState<any[]>([
    {
      id: 1,
      crewId: 101,
      date: new Date().toISOString().split("T")[0],
      reason: "Called in sick without prior notice",
      status: "unexcused",
      notes: "Second occurrence this month",
    },
    {
      id: 2,
      crewId: 102,
      date: addDays(new Date(), -2).toISOString().split("T")[0],
      reason: "Family emergency",
      status: "excused",
      notes: "Provided documentation",
    },
  ])

  // Form state for recording new absence
  const [absenceForm, setAbsenceForm] = useState({
    crewId: "",
    date: format(new Date(), "yyyy-MM-dd"),
    reason: "",
    status: "unexcused",
    notes: "",
  })

  // Get active crews
  const activeCrews = getActiveCrews()

  // Filter crews based on search query
  const filteredCrews = activeCrews.filter((crew) => {
    const fullName = `${crew.firstName} ${crew.surname}`.toLowerCase()
    return fullName.includes(searchQuery.toLowerCase())
  })

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setAbsenceForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSelectChange = (name: string, value: string) => {
    setAbsenceForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleRecordAbsence = () => {
    if (!absenceForm.crewId || !absenceForm.date || !absenceForm.reason) {
      showNotification("error", "Missing Information", "Please fill in all required fields.")
      return
    }

    setIsLoading(true)
    try {
      // In a real app, this would call a store method
      const newAbsence = {
        id: Date.now(),
        crewId: Number(absenceForm.crewId),
        date: absenceForm.date,
        reason: absenceForm.reason,
        status: absenceForm.status,
        notes: absenceForm.notes,
      }

      setUnplannedAbsences((prev) => [...prev, newAbsence])

      // Add notification for the employee
      addNotification({
        recipientId: Number(absenceForm.crewId),
        title: "Absence Recorded",
        message: `An absence has been recorded for you on ${format(parseISO(absenceForm.date), "MMMM d, yyyy")}. Status: ${absenceForm.status}.`,
        type: "warning",
      })

      // Reset form
      setAbsenceForm({
        crewId: "",
        date: format(new Date(), "yyyy-MM-dd"),
        reason: "",
        status: "unexcused",
        notes: "",
      })

      showNotification("success", "Absence Recorded", "The absence has been recorded successfully.")
    } catch (error) {
      console.error("Error recording absence:", error)
      showNotification("error", "Error", "Failed to record absence. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpdateAbsenceStatus = (absenceId: number, newStatus: string) => {
    setUnplannedAbsences((prev) =>
      prev.map((absence) => (absence.id === absenceId ? { ...absence, status: newStatus } : absence)),
    )

    const absence = unplannedAbsences.find((a) => a.id === absenceId)
    if (absence) {
      // Add notification for the employee
      addNotification({
        recipientId: absence.crewId,
        title: "Absence Status Updated",
        message: `Your absence on ${format(parseISO(absence.date), "MMMM d, yyyy")} has been marked as ${newStatus}.`,
        type: newStatus === "excused" ? "info" : "warning",
      })
    }

    showNotification("success", "Status Updated", `The absence has been marked as ${newStatus}.`)
  }

  const getEmployeeName = (crewId: number) => {
    const crew = crews.find((c) => c.id === crewId)
    return crew ? `${crew.firstName} ${crew.surname}` : "Unknown Employee"
  }

  const getBranchName = (crewId: number) => {
    const branch = getAssignedBranch(crewId)
    return branch ? branch.branchName : "Unassigned"
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Absence Management</h1>
        <p className="text-muted-foreground">Track and manage employee absences</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="unplanned">Unplanned Absences</TabsTrigger>
          <TabsTrigger value="record">Record Absence</TabsTrigger>
        </TabsList>

        <TabsContent value="unplanned" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <AlertTriangle className="mr-2 h-5 w-5 text-primary" />
                Unplanned Absences
              </CardTitle>
            </CardHeader>
            <CardContent>
              {unplannedAbsences.length > 0 ? (
                <div className="space-y-4">
                  {unplannedAbsences.map((absence) => (
                    <div
                      key={absence.id}
                      className={`p-4 border rounded-md ${
                        absence.status === "excused"
                          ? "border-green-200 bg-green-50 dark:bg-green-950/20"
                          : "border-red-200 bg-red-50 dark:bg-red-950/20"
                      }`}
                    >
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-lg">{getEmployeeName(absence.crewId)}</h3>
                            <Badge variant={absence.status === "excused" ? "default" : "destructive"}>
                              {absence.status === "excused" ? "Excused" : "Unexcused"}
                            </Badge>
                          </div>

                          <div className="text-sm text-muted-foreground mt-1">
                            <div>Date: {format(parseISO(absence.date), "MMMM d, yyyy")}</div>
                            <div>Branch: {getBranchName(absence.crewId)}</div>
                          </div>

                          <div className="mt-2 text-sm">
                            <span className="text-muted-foreground">Reason: </span>
                            {absence.reason}
                          </div>

                          {absence.notes && (
                            <div className="mt-1 text-sm">
                              <span className="text-muted-foreground">Notes: </span>
                              {absence.notes}
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2">
                          {absence.status !== "excused" && (
                            <Button
                              variant="outline"
                              className="border-green-500 text-green-600 hover:bg-green-50 hover:text-green-700"
                              onClick={() => handleUpdateAbsenceStatus(absence.id, "excused")}
                            >
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Mark Excused
                            </Button>
                          )}

                          {absence.status !== "unexcused" && (
                            <Button
                              variant="outline"
                              className="border-red-500 text-red-600 hover:bg-red-50 hover:text-red-700"
                              onClick={() => handleUpdateAbsenceStatus(absence.id, "unexcused")}
                            >
                              <XCircle className="h-4 w-4 mr-2" />
                              Mark Unexcused
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground">No unplanned absences recorded</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="record" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="mr-2 h-5 w-5 text-primary" />
                Record New Absence
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="crewId">Employee</Label>
                  <Select value={absenceForm.crewId} onValueChange={(value) => handleSelectChange("crewId", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select employee" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredCrews.map((crew) => (
                        <SelectItem key={crew.id} value={crew.id.toString()}>
                          {crew.firstName} {crew.surname}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="date">Absence Date</Label>
                  <Input
                    id="date"
                    name="date"
                    type="date"
                    value={absenceForm.date}
                    onChange={handleInputChange}
                    max={format(new Date(), "yyyy-MM-dd")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reason">Reason for Absence</Label>
                  <Textarea
                    id="reason"
                    name="reason"
                    placeholder="Enter the reason for absence"
                    value={absenceForm.reason}
                    onChange={handleInputChange}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select value={absenceForm.status} onValueChange={(value) => handleSelectChange("status", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="excused">Excused</SelectItem>
                      <SelectItem value="unexcused">Unexcused</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Additional Notes</Label>
                  <Textarea
                    id="notes"
                    name="notes"
                    placeholder="Enter any additional notes"
                    value={absenceForm.notes}
                    onChange={handleInputChange}
                    rows={2}
                  />
                </div>

                <Button
                  className="w-full"
                  onClick={handleRecordAbsence}
                  disabled={isLoading || !absenceForm.crewId || !absenceForm.date || !absenceForm.reason}
                >
                  {isLoading ? "Recording..." : "Record Absence"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
