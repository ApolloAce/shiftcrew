"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useNotification } from "@/components/notification-provider"
import { getActiveEmployees } from "@/lib/firestore-employee-service"
import { getAllAbsences, addAbsence, updateAbsenceStatus, deleteAbsence, type Absence } from "@/lib/firestore-absence-service"
import { saveAttendanceRecord, deleteAttendanceRecord } from "@/lib/firestore-attendance-service"
import { format, parseISO } from "date-fns"
import { AlertTriangle, CheckCircle, XCircle, FileText, RefreshCw, Plus, Search, Trash2 } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export default function AbsencesPage() {
  const { showNotification } = useNotification()
  const [employees, setEmployees] = useState<any[]>([])
  const [absences, setAbsences] = useState<Absence[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showRecordDialog, setShowRecordDialog] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [employeeSearch, setEmployeeSearch] = useState("")
  const [showEmployeeResults, setShowEmployeeResults] = useState(false)

  // Fetch Firestore data on mount
  const fetchData = async () => {
    try {
      setIsLoading(true)
      const [emps, abs] = await Promise.all([
        getActiveEmployees(),
        getAllAbsences()
      ])
      console.log("Absences: Fetched employees from Firestore", emps)
      console.log("Absences: Fetched absences from Firestore", abs)
      setEmployees(emps)
      setAbsences(abs)
    } catch (error) {
      console.error("Absences: Error fetching data from Firestore:", error)
      showNotification("error", "Error", "Failed to load data")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Form state for recording new absence
  const [absenceForm, setAbsenceForm] = useState({
    employeeId: "",
    date: format(new Date(), "yyyy-MM-dd"),
    reason: "",
    status: "unexcused" as "excused" | "unexcused",
    notes: "",
  })

  // Use employees from Firestore
  const activeEmployees = employees

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setAbsenceForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSelectChange = (name: string, value: string) => {
    setAbsenceForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleRecordAbsence = async () => {
    if (!absenceForm.employeeId || !absenceForm.date || !absenceForm.reason) {
      showNotification("error", "Missing Information", "Please fill in all required fields.")
      return
    }

    setIsSubmitting(true)
    try {
      // Get employee details
      const employee = employees.find((e) => String(e.id) === absenceForm.employeeId)
      const employeeName = employee ? `${employee.firstName} ${employee.surname}` : undefined

      // Save to Firestore
      const absenceId = await addAbsence({
        employeeId: absenceForm.employeeId,
        employeeName,
        date: absenceForm.date,
        reason: absenceForm.reason,
        status: absenceForm.status,
        notes: absenceForm.notes || undefined,
      })

      // Update attendance record based on absence status
      await saveAttendanceRecord({
        employeeId: absenceForm.employeeId,
        employeeName,
        date: absenceForm.date,
        status: absenceForm.status === "excused" ? "excused" : "absent",
      })

      // Add to local state
      const newAbsence: Absence = {
        id: absenceId,
        employeeId: absenceForm.employeeId,
        employeeName,
        date: absenceForm.date,
        reason: absenceForm.reason,
        status: absenceForm.status,
        notes: absenceForm.notes || undefined,
        createdAt: new Date().toISOString(),
      }

      setAbsences((prev) => [newAbsence, ...prev])

      // Reset form
      setAbsenceForm({
        employeeId: "",
        date: format(new Date(), "yyyy-MM-dd"),
        reason: "",
        status: "unexcused",
        notes: "",
      })

      showNotification("success", "Absence Recorded", "The absence has been recorded successfully.")
      setShowRecordDialog(false)
      setEmployeeSearch("")
    } catch (error) {
      console.error("Error recording absence:", error)
      showNotification("error", "Error", "Failed to record absence. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdateAbsenceStatus = async (absenceId: string, newStatus: "excused" | "unexcused") => {
    try {
      await updateAbsenceStatus(absenceId, newStatus)

      // Update attendance record to match absence status
      const absence = absences.find((a) => a.id === absenceId)
      if (absence) {
        await saveAttendanceRecord({
          employeeId: absence.employeeId,
          employeeName: absence.employeeName,
          date: absence.date,
          status: newStatus === "excused" ? "excused" : "absent",
        })
      }
      
      // Update local state
      setAbsences((prev) =>
        prev.map((absence) => (absence.id === absenceId ? { ...absence, status: newStatus } : absence)),
      )

      showNotification("success", "Status Updated", `The absence has been marked as ${newStatus}.`)
    } catch (error) {
      console.error("Error updating absence status:", error)
      showNotification("error", "Error", "Failed to update absence status.")
    }
  }

  const handleDeleteAbsence = async (absence: Absence) => {
    try {
      await deleteAbsence(absence.id!)
      // Revert attendance record by deleting the "absent" entry
      await deleteAttendanceRecord(absence.employeeId, absence.date)
      setAbsences((prev) => prev.filter((a) => a.id !== absence.id))
      showNotification("success", "Absence Deleted", "The absence record has been removed and attendance status reverted.")
    } catch (error) {
      console.error("Error deleting absence:", error)
      showNotification("error", "Error", "Failed to delete absence.")
    }
  }

  const getEmployeeName = (employeeId: string | number, absence?: Absence) => {
    // First check if the absence has the name stored
    if (absence?.employeeName) {
      return absence.employeeName
    }
    // Fall back to looking up from employees list
    const emp = employees.find((e) => String(e.id) === String(employeeId))
    return emp ? `${emp.firstName} ${emp.surname}` : "Unknown Employee"
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Absence Management</h1>
          <p className="text-muted-foreground">Track and manage employee absences</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowRecordDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Record Absence
          </Button>
          <Button variant="outline" onClick={fetchData} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <AlertTriangle className="mr-2 h-5 w-5 text-primary" />
            Unplanned Absences
            {absences.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {absences.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading absence data...</div>
          ) : absences.length > 0 ? (
            <div className="space-y-4">
              {absences.map((absence) => (
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
                        <h3 className="font-medium text-lg">{getEmployeeName(absence.employeeId, absence)}</h3>
                        <Badge variant={absence.status === "excused" ? "default" : "destructive"}>
                          {absence.status === "excused" ? "Excused" : "Unexcused"}
                        </Badge>
                      </div>

                      <div className="text-sm text-muted-foreground mt-1">
                        <div>Date: {format(parseISO(absence.date), "MMMM d, yyyy")}</div>
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
                          onClick={() => handleUpdateAbsenceStatus(absence.id!, "excused")}
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Mark Excused
                        </Button>
                      )}

                      {absence.status !== "unexcused" && (
                        <Button
                          variant="outline"
                          className="border-red-500 text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => handleUpdateAbsenceStatus(absence.id!, "unexcused")}
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Mark Unexcused
                        </Button>
                      )}

                      <Button
                        variant="outline"
                        className="border-gray-400 text-gray-600 hover:bg-gray-50 hover:text-gray-700"
                        onClick={() => handleDeleteAbsence(absence)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">No absences recorded</div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showRecordDialog} onOpenChange={setShowRecordDialog}>
        <DialogContent className="overflow-visible">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <FileText className="mr-2 h-5 w-5 text-primary" />
              Record New Absence
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-visible">
            <div className="space-y-2 relative z-10">
              <Label>Employee</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by name or Employee ID..."
                  className="pl-10"
                  value={employeeSearch}
                  onChange={(e) => {
                    setEmployeeSearch(e.target.value)
                    setShowEmployeeResults(true)
                    if (!e.target.value) {
                      setAbsenceForm((prev) => ({ ...prev, employeeId: "" }))
                    }
                  }}
                  onFocus={() => setShowEmployeeResults(true)}
                />
                {showEmployeeResults && employeeSearch && (
                  <div className="absolute z-[100] mt-1 w-full rounded-md border bg-white dark:bg-gray-900 shadow-lg max-h-48 overflow-y-auto">
                    {activeEmployees
                      .filter((emp) => {
                        const q = employeeSearch.toLowerCase()
                        const fullName = `${emp.firstName} ${emp.surname}`.toLowerCase()
                        return fullName.includes(q) || (emp.employeeCode || "").toLowerCase().includes(q)
                      })
                      .map((emp) => (
                        <button
                          key={emp.id}
                          type="button"
                          className={`w-full text-left px-3 py-2 hover:bg-accent flex items-center justify-between text-sm ${
                            absenceForm.employeeId === String(emp.id) ? "bg-accent" : ""
                          }`}
                          onClick={() => {
                            setAbsenceForm((prev) => ({ ...prev, employeeId: String(emp.id) }))
                            setEmployeeSearch(`${emp.firstName} ${emp.surname}`)
                            setShowEmployeeResults(false)
                          }}
                        >
                          <span>{emp.firstName} {emp.surname}</span>
                          <span className="text-xs text-muted-foreground font-mono">{emp.employeeCode || "—"}</span>
                        </button>
                      ))}
                    {activeEmployees.filter((emp) => {
                      const q = employeeSearch.toLowerCase()
                      const fullName = `${emp.firstName} ${emp.surname}`.toLowerCase()
                      return fullName.includes(q) || (emp.employeeCode || "").toLowerCase().includes(q)
                    }).length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">No employees found</div>
                    )}
                  </div>
                )}
              </div>
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
              disabled={isSubmitting || !absenceForm.employeeId || !absenceForm.date || !absenceForm.reason}
            >
              {isSubmitting ? "Recording..." : "Record Absence"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
