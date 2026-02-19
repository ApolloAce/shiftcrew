"use client"

import { useState, useCallback, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useNotification } from "@/components/notification-provider"
import { useDialog } from "@/components/dialog-provider"
import { Archive, RotateCcw, Search, Trash2 } from "lucide-react"
import { ErrorBoundary } from "@/components/error-boundary"
import {
  getActiveEmployees,
  getArchivedEmployees,
  updateEmployee,
  archiveEmployee,
  restoreEmployee,
  deleteEmployee,
  type Employee,
} from "@/lib/firestore-employee-service"
import { getTodayAttendance } from "@/lib/firestore-attendance-service"

export default function EmployeesPage() {
  // Wrap the entire component in an error boundary
  return (
    <ErrorBoundary>
      <EmployeesContent />
    </ErrorBoundary>
  )
}

function EmployeesContent() {
  const { showNotification } = useNotification()
  const { openDialog, closeDialog, openConfirmDialog } = useDialog()
  const [activeTab, setActiveTab] = useState<"active" | "archived">("active")
  const [searchQuery, setSearchQuery] = useState("")
  const [editingEmployee, setEditingEmployee] = useState<any>(null)
  const [mode, setMode] = useState<"full-time" | "part-time">("full-time")
  const [isProcessing, setIsProcessing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [activeCrews, setActiveCrews] = useState<Employee[]>([])
  const [archivedCrews, setArchivedCrews] = useState<Employee[]>([])
  const [todayAttendance, setTodayAttendance] = useState<Record<string, boolean>>({})

  // Fetch employees and today's attendance from MySQL
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        setIsLoading(true)
        const [active, archived, attendance] = await Promise.all([
          getActiveEmployees(),
          getArchivedEmployees(),
          getTodayAttendance(),
        ])
        setActiveCrews(active)
        setArchivedCrews(archived)

        // Build a lookup: employeeId -> true/false based on daily_attendance
        const attendanceMap: Record<string, boolean> = {}
        for (const rec of attendance) {
          attendanceMap[rec.employeeId] = rec.status === "present"
        }
        setTodayAttendance(attendanceMap)
        
        if (active.length === 0 && archived.length === 0) {
          showNotification("info", "No Employees", "No employees found in the database.")
        }
      } catch (error) {
        console.error("Error fetching employees:", error)
        showNotification("error", "Error", `Failed to load employees: ${error instanceof Error ? error.message : String(error)}`)
      } finally {
        setIsLoading(false)
      }
    }

    fetchEmployees()
  }, [showNotification])

  // Helper: check attendance from daily_attendance table (not users.isPresent)
  const isEmployeePresent = (employeeId: string) => {
    return todayAttendance[employeeId] === true
  }

  // Filter crews based on search query
  const filteredActiveCrews = activeCrews.filter((crew) => {
    const fullName = `${crew.firstName} ${crew.surname}`.toLowerCase()
    return fullName.includes(searchQuery.toLowerCase())
  })

  const filteredArchivedCrews = archivedCrews.filter((crew) => {
    const fullName = `${crew.firstName} ${crew.surname}`.toLowerCase()
    return fullName.includes(searchQuery.toLowerCase())
  })

  const handleStartEdit = useCallback(
    (employee: Employee) => {
      if (isProcessing) return

      try {
        setEditingEmployee({ ...employee })
        setMode((employee.type || "full-time") as "full-time" | "part-time")

        openDialog(
          <div className="space-y-6 py-4">
            <div className="flex justify-center gap-4">
              <Button variant={mode === "full-time" ? "default" : "outline"} onClick={() => setMode("full-time")}>
                Full-Time
              </Button>
              <Button variant={mode === "part-time" ? "default" : "outline"} onClick={() => setMode("part-time")}>
                Part-Time
              </Button>
            </div>

            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="editFirstName">First Name</Label>
                <Input
                  id="editFirstName"
                  value={editingEmployee?.firstName || ""}
                  onChange={(e) =>
                    setEditingEmployee((prev: any) => ({
                      ...prev,
                      firstName: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="editSurname">Surname</Label>
                <Input
                  id="editSurname"
                  value={editingEmployee?.surname || ""}
                  onChange={(e) =>
                    setEditingEmployee((prev: any) => ({
                      ...prev,
                      surname: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="editNickname">Nickname</Label>
                <Input
                  id="editNickname"
                  value={editingEmployee?.nickname || ""}
                  onChange={(e) =>
                    setEditingEmployee((prev: any) => ({
                      ...prev,
                      nickname: e.target.value,
                    }))
                  }
                />
              </div>

              {mode === "part-time" && (
                <div className="grid gap-2">
                  <Label>Availability</Label>
                  <div className="grid grid-cols-7 gap-2">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                      <div key={day} className="flex flex-col items-center">
                        <span className="text-sm">{day}</span>
                        <Checkbox
                          checked={editingEmployee?.availability?.includes(day)}
                          onCheckedChange={(checked) => {
                            if (!editingEmployee) return
                            const availability = [...(editingEmployee.availability || [])]
                            if (checked) {
                              if (!availability.includes(day)) {
                                availability.push(day)
                              }
                            } else {
                              const index = availability.indexOf(day)
                              if (index !== -1) {
                                availability.splice(index, 1)
                              }
                            }
                            setEditingEmployee((prev: any) => ({
                              ...prev,
                              availability,
                            }))
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (editingEmployee) {
                    setIsProcessing(true)
                    try {
                      const updatedEmployee = { ...editingEmployee, type: mode }
                      await updateEmployee(editingEmployee.id, updatedEmployee)
                      closeDialog()

                      // Refresh the employee list
                      const [active, archived] = await Promise.all([getActiveEmployees(), getArchivedEmployees()])
                      setActiveCrews(active)
                      setArchivedCrews(archived)

                      const employeeName = `${updatedEmployee.firstName} ${updatedEmployee.surname}`
                      showNotification(
                        "success",
                        "Employee Updated",
                        `${employeeName}'s information has been updated successfully.`,
                      )
                    } catch (error) {
                      console.error("Error updating employee:", error)
                      showNotification("error", "Error", "Failed to update employee")
                    } finally {
                      setIsProcessing(false)
                    }
                  }
                }}
                disabled={isProcessing}
              >
                {isProcessing ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>,
          "Edit Employee",
        )
      } catch (error) {
        console.error("Error starting edit:", error)
        showNotification("error", "Error", "Failed to open edit dialog")
      }
    },
    [openDialog, closeDialog, showNotification, mode, editingEmployee, isProcessing],
  )

  const handleArchiveClick = useCallback(
    (employeeId: string) => {
      if (isProcessing) return

      try {
        // Find employee details for notification
        const employee = activeCrews.find((c) => c.id === employeeId)
        if (!employee) {
          showNotification("error", "Error", "Employee not found")
          return
        }

        const employeeName = `${employee.firstName} ${employee.surname}`

        openConfirmDialog({
          title: "Archive this employee?",
          description:
            "This will archive the employee record. The employee will no longer appear in active lists, but their data will be preserved and can be restored later if needed.",
          confirmLabel: "Archive",
          confirmVariant: "bg-amber-600 hover:bg-amber-700",
          onConfirm: async () => {
            setIsProcessing(true)
            try {
              await archiveEmployee(employeeId)
              
              // Refresh the employee list
              const [active, archived] = await Promise.all([getActiveEmployees(), getArchivedEmployees()])
              setActiveCrews(active)
              setArchivedCrews(archived)
              
              showNotification(
                "info",
                "Employee Archived",
                `${employeeName} has been archived and can be restored if needed.`,
              )
            } catch (error) {
              console.error("Error archiving employee:", error)
              showNotification("error", "Error", "Failed to archive employee")
            } finally {
              setIsProcessing(false)
            }
          },
        })
      } catch (error) {
        console.error("Error handling archive:", error)
        showNotification("error", "Error", "Failed to process archive request")
      }
    },
    [openConfirmDialog, showNotification, activeCrews, isProcessing],
  )

  const handleRestoreClick = useCallback(
    (employeeId: string) => {
      if (isProcessing) return

      try {
        // Find employee details for notification
        const employee = archivedCrews.find((c) => c.id === employeeId)
        if (!employee) {
          showNotification("error", "Error", "Employee not found")
          return
        }

        const employeeName = `${employee.firstName} ${employee.surname}`

        openConfirmDialog({
          title: "Restore this employee?",
          description:
            "This will restore the employee to active status. The employee will appear in active lists and be available for assignments.",
          confirmLabel: "Restore",
          confirmVariant: "bg-green-600 hover:bg-green-700",
          onConfirm: async () => {
            setIsProcessing(true)
            try {
              await restoreEmployee(employeeId)
              
              // Refresh the employee list
              const [active, archived] = await Promise.all([getActiveEmployees(), getArchivedEmployees()])
              setActiveCrews(active)
              setArchivedCrews(archived)
              
              showNotification("success", "Employee Restored", `${employeeName} has been restored to active status.`)
            } catch (error) {
              console.error("Error restoring employee:", error)
              showNotification("error", "Error", "Failed to restore employee")
            } finally {
              setIsProcessing(false)
            }
          },
        })
      } catch (error) {
        console.error("Error handling restore:", error)
        showNotification("error", "Error", "Failed to process restore request")
      }
    },
    [openConfirmDialog, showNotification, archivedCrews, isProcessing],
  )

  const handleDeleteClick = useCallback(
    (employeeId: string) => {
      if (isProcessing) return

      try {
        // Find employee details for notification
        const employee = [...activeCrews, ...archivedCrews].find((c) => c.id === employeeId)
        if (!employee) {
          showNotification("error", "Error", "Employee not found")
          return
        }

        const employeeName = `${employee.firstName} ${employee.surname}`

        openConfirmDialog({
          title: "Permanently delete this employee?",
          description:
            "This action cannot be undone. This will permanently delete the employee record from the system.",
          confirmLabel: "Delete Permanently",
          confirmVariant: "bg-red-600 hover:bg-red-700",
          onConfirm: async () => {
            setIsProcessing(true)
            try {
              await deleteEmployee(employeeId)
              
              // Refresh the employee list
              const [active, archived] = await Promise.all([getActiveEmployees(), getArchivedEmployees()])
              setActiveCrews(active)
              setArchivedCrews(archived)
              
              showNotification(
                "info",
                "Employee Deleted",
                `${employeeName} has been permanently deleted from the system.`,
              )
            } catch (error) {
              console.error("Error deleting employee:", error)
              showNotification("error", "Error", "Failed to delete employee")
            } finally {
              setIsProcessing(false)
            }
          },
        })
      } catch (error) {
        console.error("Error handling delete:", error)
        showNotification("error", "Error", "Failed to process delete request")
      }
    },
    [openConfirmDialog, showNotification, activeCrews, archivedCrews, isProcessing],
  )

  const EmployeeList = ({ employees, isArchived = false }: { employees: Employee[]; isArchived?: boolean }) => (
    <div className="rounded-md border overflow-x-auto">
      <div className="min-w-[800px]">
        <div className="grid grid-cols-5 p-4 font-medium bg-muted/50">
          <div>Name</div>
          <div>Type</div>
          <div>Status</div>
          <div>Branch</div>
          <div>Actions</div>
        </div>

        {employees.length > 0 ? (
          employees.map((employee) => (
            <div key={employee.id} className="grid grid-cols-5 p-4 border-t items-center">
              <div className="font-medium">
                {employee.firstName} {employee.surname}
              </div>
              <div>{employee.type || "Not specified"}</div>
              <div>
                <Badge variant={isEmployeePresent(employee.id) ? "default" : "destructive"}>
                  {isEmployeePresent(employee.id) ? "Present" : "Absent"}
                </Badge>
              </div>
              <div>{employee.branchId ? employee.branchId : "Unassigned"}</div>
              <div className="flex gap-2">
                {!isArchived ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleStartEdit(employee)}
                      disabled={isProcessing}
                    >
                      Edit
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className="text-amber-600 border-amber-600"
                      onClick={() => handleArchiveClick(employee.id)}
                      disabled={isProcessing}
                    >
                      <Archive className="h-4 w-4 mr-1" />
                      <span className="hidden sm:inline">Archive</span>
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-green-600 border-green-600"
                      onClick={() => handleRestoreClick(employee.id)}
                      disabled={isProcessing}
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      <span className="hidden sm:inline">Restore</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 border-red-600"
                      onClick={() => handleDeleteClick(employee.id)}
                      disabled={isProcessing}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      <span className="hidden sm:inline">Delete</span>
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="p-8 text-center text-muted-foreground">
            {isArchived
              ? "No archived employees found."
              : "No active employees found. Add employees in the Crew Registration section."}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Employees Management</h1>
        <p className="text-muted-foreground">View, edit, and manage employee information</p>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search employees..."
          className="pl-10"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          disabled={isLoading}
        />
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-8">
            <div className="text-center text-muted-foreground">Loading employees...</div>
          </CardContent>
        </Card>
      ) : (
        <Tabs
          defaultValue="active"
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as "active" | "archived")}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="active">Active Employees</TabsTrigger>
            <TabsTrigger value="archived">Archived Employees</TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            <Card>
              <CardHeader>
                <CardTitle>Active Employee List</CardTitle>
              </CardHeader>
              <CardContent>
                <EmployeeList employees={filteredActiveCrews} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="archived">
            <Card>
              <CardHeader>
                <CardTitle>Archived Employee List</CardTitle>
              </CardHeader>
              <CardContent>
                <EmployeeList employees={filteredArchivedCrews} isArchived={true} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
